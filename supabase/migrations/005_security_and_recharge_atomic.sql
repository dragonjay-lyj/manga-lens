-- 安全加固 + 充值原子结算

-- 当前请求用户 ID（从 JWT claims 读取）
CREATE OR REPLACE FUNCTION public.current_request_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claims', true)::json ->> 'sub',
        ''
    );
$$;

REVOKE ALL ON FUNCTION public.current_request_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_request_user_id() TO authenticated, service_role;

-- 是否管理员
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = public.current_request_user_id()
          AND role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;

-- 重新收紧 system_settings 的 RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Service role can update settings" ON public.system_settings;
DROP POLICY IF EXISTS "Service role can insert settings" ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_select ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_insert ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_update ON public.system_settings;
DROP POLICY IF EXISTS system_settings_admin_delete ON public.system_settings;

CREATE POLICY system_settings_admin_select
    ON public.system_settings FOR SELECT
    USING (public.is_admin_user());

CREATE POLICY system_settings_admin_insert
    ON public.system_settings FOR INSERT
    WITH CHECK (public.is_admin_user());

CREATE POLICY system_settings_admin_update
    ON public.system_settings FOR UPDATE
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());

CREATE POLICY system_settings_admin_delete
    ON public.system_settings FOR DELETE
    USING (public.is_admin_user());

-- 重新收紧 coin_transactions 的 RLS
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.coin_transactions;
DROP POLICY IF EXISTS "Service role can insert transactions" ON public.coin_transactions;
DROP POLICY IF EXISTS "Service role can update transactions" ON public.coin_transactions;
DROP POLICY IF EXISTS coin_transactions_select_own_or_admin ON public.coin_transactions;
DROP POLICY IF EXISTS coin_transactions_insert_admin_only ON public.coin_transactions;
DROP POLICY IF EXISTS coin_transactions_update_admin_only ON public.coin_transactions;
DROP POLICY IF EXISTS coin_transactions_delete_admin_only ON public.coin_transactions;

CREATE POLICY coin_transactions_select_own_or_admin
    ON public.coin_transactions FOR SELECT
    USING (
        user_id = public.current_request_user_id()
        OR public.is_admin_user()
    );

CREATE POLICY coin_transactions_insert_admin_only
    ON public.coin_transactions FOR INSERT
    WITH CHECK (public.is_admin_user());

CREATE POLICY coin_transactions_update_admin_only
    ON public.coin_transactions FOR UPDATE
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());

CREATE POLICY coin_transactions_delete_admin_only
    ON public.coin_transactions FOR DELETE
    USING (public.is_admin_user());

-- 订单结算：pending -> completed + 原子加币（幂等）
CREATE OR REPLACE FUNCTION public.complete_recharge_order(
    p_out_trade_no TEXT,
    p_trade_no TEXT,
    p_paid_amount NUMERIC
)
RETURNS TABLE(
    applied BOOLEAN,
    status TEXT,
    message TEXT,
    user_id TEXT,
    credited_amount INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.coin_transactions%ROWTYPE;
    v_paid_amount NUMERIC(10, 2);
BEGIN
    IF p_out_trade_no IS NULL OR btrim(p_out_trade_no) = '' THEN
        RETURN QUERY SELECT false, 'invalid', 'OUT_TRADE_NO_REQUIRED', NULL::TEXT, 0;
        RETURN;
    END IF;

    IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
        RETURN QUERY SELECT false, 'invalid', 'PAID_AMOUNT_INVALID', NULL::TEXT, 0;
        RETURN;
    END IF;

    v_paid_amount := round(p_paid_amount::NUMERIC, 2);
    IF trunc(v_paid_amount) <> v_paid_amount THEN
        RETURN QUERY SELECT false, 'invalid', 'PAID_AMOUNT_MUST_BE_INTEGER', NULL::TEXT, 0;
        RETURN;
    END IF;

    SELECT *
    INTO v_order
    FROM public.coin_transactions
    WHERE out_trade_no = p_out_trade_no
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'not_found', 'ORDER_NOT_FOUND', NULL::TEXT, 0;
        RETURN;
    END IF;

    IF v_order.type <> 'recharge' THEN
        RETURN QUERY SELECT false, 'invalid', 'INVALID_ORDER_TYPE', v_order.user_id, 0;
        RETURN;
    END IF;

    IF v_order.status = 'completed' THEN
        RETURN QUERY SELECT false, 'already_completed', 'ALREADY_COMPLETED', v_order.user_id, 0;
        RETURN;
    END IF;

    IF v_order.status <> 'pending' THEN
        RETURN QUERY SELECT false, 'invalid_status', 'ORDER_NOT_PENDING', v_order.user_id, 0;
        RETURN;
    END IF;

    IF v_order.amount <> v_paid_amount THEN
        RETURN QUERY SELECT false, 'amount_mismatch', 'AMOUNT_MISMATCH', v_order.user_id, 0;
        RETURN;
    END IF;

    PERFORM 1
    FROM public.users
    WHERE id = v_order.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'user_not_found', 'USER_NOT_FOUND', v_order.user_id, 0;
        RETURN;
    END IF;

    UPDATE public.coin_transactions
    SET
        status = 'completed',
        trade_no = COALESCE(NULLIF(p_trade_no, ''), trade_no),
        completed_at = NOW()
    WHERE id = v_order.id;

    UPDATE public.users
    SET
        credits = COALESCE(credits, 0) + v_paid_amount::INTEGER,
        updated_at = NOW()
    WHERE id = v_order.user_id;

    RETURN QUERY SELECT true, 'completed', 'OK', v_order.user_id, v_paid_amount::INTEGER;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_recharge_order(TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_recharge_order(TEXT, TEXT, NUMERIC) TO service_role;

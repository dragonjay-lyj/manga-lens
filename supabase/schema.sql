-- MangaLens Supabase Database Schema (Snapshot)
-- 推荐优先执行 supabase/migrations 下的迁移文件。
-- 此文件与当前迁移保持一致，便于新环境一次性初始化。

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- Core Tables
-- =============================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,               -- Clerk user_id
    clerk_id TEXT,                     -- 兼容字段（与 id 同值）
    email TEXT,
    username TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',          -- user, premium, admin
    credits INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

CREATE TABLE IF NOT EXISTS user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,            -- gemini, openai, custom
    encrypted_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_url TEXT NOT NULL,
    result_url TEXT,
    width INTEGER,
    height INTEGER,
    selections JSONB DEFAULT '[]',
    prompt TEXT,
    status TEXT DEFAULT 'idle',        -- idle, processing, completed, failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                -- recharge, consume, refund
    amount DECIMAL(10, 2) NOT NULL,
    out_trade_no TEXT UNIQUE,
    trade_no TEXT,
    status TEXT DEFAULT 'pending',     -- pending, completed, failed, refunded
    payment_method TEXT DEFAULT 'linuxdo_credit',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description, is_encrypted) VALUES
    ('linuxdo_credit_pid', '', 'LINUX DO Credit Client ID', false),
    ('linuxdo_credit_key', '', 'LINUX DO Credit Client Secret', true),
    ('linuxdo_credit_notify_url', '', 'LINUX DO Credit 回调地址', false),
    ('linuxdo_credit_return_url', '', 'LINUX DO Credit 返回地址', false),
    ('linuxdo_credit_enabled', 'false', '是否启用 LINUX DO Credit 支付', false),
    ('server_api_enabled', 'false', '是否启用网站统一 AI API', false),
    ('server_api_provider', 'gemini', '网站统一 AI Provider（gemini/openai）', false),
    ('server_api_key', '', '网站统一 AI API Key', true),
    ('server_api_base_url', 'https://api.openai.com/v1', '网站统一 OpenAI 兼容接口 Base URL', false),
    ('server_api_model', 'gemini-2.5-flash-image', '网站统一 AI 默认模型', false)
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- Indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_project_images_project_id ON project_images(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_out_trade_no ON coin_transactions(out_trade_no);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_status ON coin_transactions(status);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- =============================================
-- Utility Functions / Triggers
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_project_images_updated_at ON project_images;
CREATE TRIGGER update_project_images_updated_at
    BEFORE UPDATE ON project_images
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_user_api_keys_updated_at ON user_api_keys;
CREATE TRIGGER update_user_api_keys_updated_at
    BEFORE UPDATE ON user_api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can manage own api keys" ON user_api_keys;
DROP POLICY IF EXISTS "Users can manage own projects" ON projects;
DROP POLICY IF EXISTS "Users can manage own project images" ON project_images;
DROP POLICY IF EXISTS "Users can view own usage logs" ON usage_logs;
DROP POLICY IF EXISTS admin_all_users ON users;
DROP POLICY IF EXISTS admin_all_projects ON projects;
DROP POLICY IF EXISTS admin_all_images ON project_images;
DROP POLICY IF EXISTS admin_all_usage_logs ON usage_logs;

CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (id = public.current_request_user_id());

CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (id = public.current_request_user_id());

CREATE POLICY "Users can manage own api keys" ON user_api_keys
    FOR ALL USING (user_id = public.current_request_user_id());

CREATE POLICY "Users can manage own projects" ON projects
    FOR ALL USING (user_id = public.current_request_user_id());

CREATE POLICY "Users can manage own project images" ON project_images
    FOR ALL USING (
        project_id IN (
            SELECT id FROM projects WHERE user_id = public.current_request_user_id()
        )
    );

CREATE POLICY "Users can view own usage logs" ON usage_logs
    FOR SELECT USING (user_id = public.current_request_user_id());

CREATE POLICY admin_all_users ON users
    FOR ALL USING (public.is_admin_user());

CREATE POLICY admin_all_projects ON projects
    FOR ALL USING (public.is_admin_user());

CREATE POLICY admin_all_images ON project_images
    FOR ALL USING (public.is_admin_user());

CREATE POLICY admin_all_usage_logs ON usage_logs
    FOR ALL USING (public.is_admin_user());

DROP POLICY IF EXISTS coin_transactions_select_own_or_admin ON coin_transactions;
DROP POLICY IF EXISTS coin_transactions_insert_admin_only ON coin_transactions;
DROP POLICY IF EXISTS coin_transactions_update_admin_only ON coin_transactions;
DROP POLICY IF EXISTS coin_transactions_delete_admin_only ON coin_transactions;

CREATE POLICY coin_transactions_select_own_or_admin
    ON coin_transactions FOR SELECT
    USING ( 
        user_id = public.current_request_user_id()
        OR public.is_admin_user()
    );

CREATE POLICY coin_transactions_insert_admin_only
    ON coin_transactions FOR INSERT
    WITH CHECK (public.is_admin_user());

CREATE POLICY coin_transactions_update_admin_only
    ON coin_transactions FOR UPDATE
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());

CREATE POLICY coin_transactions_delete_admin_only
    ON coin_transactions FOR DELETE
    USING (public.is_admin_user());

DROP POLICY IF EXISTS system_settings_admin_select ON system_settings;
DROP POLICY IF EXISTS system_settings_admin_insert ON system_settings;
DROP POLICY IF EXISTS system_settings_admin_update ON system_settings;
DROP POLICY IF EXISTS system_settings_admin_delete ON system_settings;

CREATE POLICY system_settings_admin_select
    ON system_settings FOR SELECT
    USING (public.is_admin_user());

CREATE POLICY system_settings_admin_insert
    ON system_settings FOR INSERT
    WITH CHECK (public.is_admin_user());

CREATE POLICY system_settings_admin_update
    ON system_settings FOR UPDATE
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());

CREATE POLICY system_settings_admin_delete
    ON system_settings FOR DELETE
    USING (public.is_admin_user());

-- LINUX DO Credit 支付系统迁移
-- 创建积分交易表

-- 积分交易表
CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,  -- recharge, consume, refund
    amount DECIMAL(10, 2) NOT NULL,
    out_trade_no TEXT UNIQUE,  -- 业务单号
    trade_no TEXT,  -- LINUX DO Credit 平台订单号
    status TEXT DEFAULT 'pending',  -- pending, completed, failed, refunded
    payment_method TEXT DEFAULT 'linuxdo_credit',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_out_trade_no ON coin_transactions(out_trade_no);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_status ON coin_transactions(status);

-- RLS 策略
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions"
    ON coin_transactions FOR SELECT
    USING (true);

CREATE POLICY "Service role can insert transactions"
    ON coin_transactions FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can update transactions"
    ON coin_transactions FOR UPDATE
    USING (true);

-- 添加 credits 列到 users 表（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'credits'
    ) THEN
        ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 100;
    END IF;
END $$;

-- 添加 clerk_id 别名列（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'clerk_id'
    ) THEN
        ALTER TABLE users ADD COLUMN clerk_id TEXT;
        UPDATE users SET clerk_id = id WHERE clerk_id IS NULL;
    END IF;
END $$;

-- 创建 clerk_id 索引
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

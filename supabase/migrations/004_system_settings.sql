-- 系统设置表迁移
-- 用于存储后台可配置的系统设置

-- 系统设置表
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- RLS 策略 - 仅管理员可访问
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 服务角色可以读写
CREATE POLICY "Service role can read settings"
    ON system_settings FOR SELECT
    USING (true);

CREATE POLICY "Service role can update settings"
    ON system_settings FOR UPDATE
    USING (true);

CREATE POLICY "Service role can insert settings"
    ON system_settings FOR INSERT
    WITH CHECK (true);

-- 插入默认的 LINUX DO Credit 配置
INSERT INTO system_settings (key, value, description, is_encrypted) VALUES
    ('linuxdo_credit_pid', '', 'LINUX DO Credit Client ID', false),
    ('linuxdo_credit_key', '', 'LINUX DO Credit Client Secret', true),
    ('linuxdo_credit_notify_url', '', 'LINUX DO Credit 回调地址', false),
    ('linuxdo_credit_return_url', '', 'LINUX DO Credit 返回地址', false),
    ('linuxdo_credit_enabled', 'false', '是否启用 LINUX DO Credit 支付', false)
ON CONFLICT (key) DO NOTHING;

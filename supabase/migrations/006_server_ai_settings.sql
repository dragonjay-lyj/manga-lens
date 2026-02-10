-- 网站统一 AI 接口配置（供编辑器“使用网站 API”模式）

INSERT INTO public.system_settings (key, value, description, is_encrypted)
VALUES
    ('server_api_enabled', 'false', '是否启用网站统一 AI API', false),
    ('server_api_provider', 'gemini', '网站统一 AI Provider（gemini/openai）', false),
    ('server_api_key', '', '网站统一 AI API Key', true),
    ('server_api_base_url', 'https://api.openai.com/v1', '网站统一 OpenAI 兼容接口 Base URL', false),
    ('server_api_model', 'gemini-2.5-flash-image', '网站统一 AI 默认模型', false)
ON CONFLICT (key) DO NOTHING;


export interface OpenAICompatibleProviderPreset {
    id: string
    label: string
    baseUrl: string
    modelHint: string
    description: string
}

export const OPENAI_COMPATIBLE_PROVIDER_PRESETS: OpenAICompatibleProviderPreset[] = [
    {
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        modelHint: "gpt-4o",
        description: "OpenAI official API",
    },
    {
        id: "siliconflow",
        label: "SiliconFlow",
        baseUrl: "https://api.siliconflow.cn/v1",
        modelHint: "deepseek-ai/DeepSeek-V3",
        description: "OpenAI-compatible cloud endpoint",
    },
    {
        id: "deepseek",
        label: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        modelHint: "deepseek-chat",
        description: "DeepSeek official OpenAI-compatible endpoint",
    },
    {
        id: "volcengine",
        label: "Volcengine (Ark)",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        modelHint: "doubao-seed-1-6-flash-250615",
        description: "Volcano Engine Ark OpenAI-compatible endpoint",
    },
    {
        id: "ollama",
        label: "Ollama (Local)",
        baseUrl: "http://127.0.0.1:11434/v1",
        modelHint: "llama3.2-vision",
        description: "Local OpenAI-compatible runtime",
    },
    {
        id: "sakura",
        label: "Sakura (OpenAI-compatible)",
        baseUrl: "http://127.0.0.1:8080/v1",
        modelHint: "sakura",
        description: "Community OpenAI-compatible deployment",
    },
]

export function getOpenAICompatibleProviderPreset(
    id: string
): OpenAICompatibleProviderPreset | undefined {
    return OPENAI_COMPATIBLE_PROVIDER_PRESETS.find((item) => item.id === id)
}

function normalizeBaseUrl(input: string): string {
    return input.trim().replace(/\/+$/, "").toLowerCase()
}

export function guessOpenAICompatibleProviderPresetId(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl)
    const matched = OPENAI_COMPATIBLE_PROVIDER_PRESETS.find(
        (item) => normalizeBaseUrl(item.baseUrl) === normalized
    )
    return matched?.id || "custom"
}

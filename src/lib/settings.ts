import { createClient } from "@supabase/supabase-js"
import type { AIProvider } from "@/types/database"

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type DefaultSystemSetting = {
    key: string
    value: string
    description: string
    is_encrypted: boolean
}

const DEFAULT_SYSTEM_SETTINGS: DefaultSystemSetting[] = [
    {
        key: "linuxdo_credit_pid",
        value: "",
        description: "LINUX DO Credit Client ID",
        is_encrypted: false,
    },
    {
        key: "linuxdo_credit_key",
        value: "",
        description: "LINUX DO Credit Client Secret",
        is_encrypted: true,
    },
    {
        key: "linuxdo_credit_notify_url",
        value: "",
        description: "LINUX DO Credit 回调地址",
        is_encrypted: false,
    },
    {
        key: "linuxdo_credit_return_url",
        value: "",
        description: "LINUX DO Credit 返回地址",
        is_encrypted: false,
    },
    {
        key: "linuxdo_credit_enabled",
        value: "false",
        description: "是否启用 LINUX DO Credit 支付",
        is_encrypted: false,
    },
    {
        key: "server_api_enabled",
        value: "false",
        description: "是否启用网站统一 AI API",
        is_encrypted: false,
    },
    {
        key: "server_api_provider",
        value: "gemini",
        description: "网站统一 AI Provider（gemini/openai-compatible）",
        is_encrypted: false,
    },
    {
        key: "server_api_key",
        value: "",
        description: "网站统一 AI API Key",
        is_encrypted: true,
    },
    {
        key: "server_api_base_url",
        value: "https://api.openai.com/v1",
        description: "网站统一 AI Base URL（OpenAI 兼容 / Gemini 中转）",
        is_encrypted: false,
    },
    {
        key: "server_api_model",
        value: "gemini-2.5-flash-image",
        description: "网站统一 AI 默认模型",
        is_encrypted: false,
    },
    {
        key: "server_api_image_size",
        value: "2K",
        description: "网站统一 AI 输出分辨率（Gemini: 1K/2K/4K）",
        is_encrypted: false,
    },
    {
        key: "comic_text_detector_enabled",
        value: "false",
        description: "是否启用 comic-text-detector 自动文本框检测",
        is_encrypted: false,
    },
    {
        key: "comic_text_detector_base_url",
        value: "",
        description: "comic-text-detector 服务地址（例如 http://127.0.0.1:5000）",
        is_encrypted: false,
    },
    {
        key: "comic_text_detector_api_key",
        value: "",
        description: "comic-text-detector 服务 API Key（可选）",
        is_encrypted: true,
    },
    {
        key: "manga_ocr_enabled",
        value: "false",
        description: "是否启用 MangaOCR 服务",
        is_encrypted: false,
    },
    {
        key: "manga_ocr_base_url",
        value: "",
        description: "MangaOCR 服务地址（例如 http://127.0.0.1:8001）",
        is_encrypted: false,
    },
    {
        key: "manga_ocr_api_key",
        value: "",
        description: "MangaOCR 服务 API Key（可选）",
        is_encrypted: true,
    },
    {
        key: "paddle_ocr_enabled",
        value: "false",
        description: "是否启用 PaddleOCR 服务",
        is_encrypted: false,
    },
    {
        key: "paddle_ocr_base_url",
        value: "",
        description: "PaddleOCR 服务地址（例如 http://127.0.0.1:8002）",
        is_encrypted: false,
    },
    {
        key: "paddle_ocr_api_key",
        value: "",
        description: "PaddleOCR 服务 API Key（可选）",
        is_encrypted: true,
    },
    {
        key: "baidu_ocr_enabled",
        value: "false",
        description: "是否启用百度 OCR",
        is_encrypted: false,
    },
    {
        key: "baidu_ocr_api_key",
        value: "",
        description: "百度 OCR API Key",
        is_encrypted: true,
    },
    {
        key: "baidu_ocr_secret_key",
        value: "",
        description: "百度 OCR Secret Key",
        is_encrypted: true,
    },
    {
        key: "baidu_ocr_base_url",
        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/general",
        description: "百度 OCR 接口地址（可覆盖）",
        is_encrypted: false,
    },
    {
        key: "lama_inpaint_enabled",
        value: "false",
        description: "是否启用 LAMA 修复服务",
        is_encrypted: false,
    },
    {
        key: "lama_inpaint_base_url",
        value: "",
        description: "LAMA 修复服务地址（例如 http://127.0.0.1:8080）",
        is_encrypted: false,
    },
    {
        key: "lama_inpaint_api_key",
        value: "",
        description: "LAMA 修复服务 API Key（可选）",
        is_encrypted: true,
    },
]

let defaultsEnsured = false

export async function ensureSystemSettingsDefaults(force = false): Promise<void> {
    if (defaultsEnsured && !force) {
        return
    }

    const { error } = await supabaseAdmin.from("system_settings").upsert(
        DEFAULT_SYSTEM_SETTINGS.map((item) => ({
            ...item,
            updated_at: new Date().toISOString(),
        })),
        {
            onConflict: "key",
            ignoreDuplicates: true,
        }
    )

    if (error) {
        console.error("Ensure system settings defaults error:", error)
        return
    }

    defaultsEnsured = true
}

export async function getSystemSetting(key: string): Promise<string | null> {
    await ensureSystemSettingsDefaults()

    const { data, error } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", key)
        .single()

    if (error || !data) {
        return null
    }

    return data.value
}

export async function getSystemSettings(keys: string[]): Promise<Record<string, string>> {
    await ensureSystemSettingsDefaults()

    const { data, error } = await supabaseAdmin
        .from("system_settings")
        .select("key, value")
        .in("key", keys)

    if (error || !data) {
        return {}
    }

    return data.reduce((acc, item) => {
        acc[item.key] = item.value || ""
        return acc
    }, {} as Record<string, string>)
}

export type LinuxdoPaymentConfigStatus = {
    enabled: boolean
    pidConfigured: boolean
    keyConfigured: boolean
    notifyUrlConfigured: boolean
    returnUrlConfigured: boolean
    isReady: boolean
}

export async function getLinuxdoPaymentConfigStatus(): Promise<LinuxdoPaymentConfigStatus> {
    const settings = await getSystemSettings([
        "linuxdo_credit_enabled",
        "linuxdo_credit_pid",
        "linuxdo_credit_key",
        "linuxdo_credit_notify_url",
        "linuxdo_credit_return_url",
    ])

    const enabled = settings.linuxdo_credit_enabled === "true"
    const pidConfigured = Boolean(settings.linuxdo_credit_pid)
    const keyConfigured = Boolean(settings.linuxdo_credit_key)
    const notifyUrlConfigured = Boolean(settings.linuxdo_credit_notify_url)
    const returnUrlConfigured = Boolean(settings.linuxdo_credit_return_url)

    return {
        enabled,
        pidConfigured,
        keyConfigured,
        notifyUrlConfigured,
        returnUrlConfigured,
        isReady: enabled && pidConfigured && keyConfigured,
    }
}

export type ServerAiRuntimeConfig = {
    enabled: boolean
    isReady: boolean
    provider: AIProvider
    config: {
        provider: AIProvider
        apiKey: string
        baseUrl?: string
        model: string
        imageSize: "1K" | "2K" | "4K"
    }
}

export async function getServerAiRuntimeConfig(): Promise<ServerAiRuntimeConfig> {
    const settings = await getSystemSettings([
        "server_api_enabled",
        "server_api_provider",
        "server_api_key",
        "server_api_base_url",
        "server_api_model",
        "server_api_image_size",
    ])

    const provider: AIProvider = settings.server_api_provider === "openai" ? "openai" : "gemini"
    const apiKey = settings.server_api_key || ""
    const model = settings.server_api_model || (provider === "openai" ? "gpt-4o" : "gemini-2.5-flash-image")
    const imageSize: "1K" | "2K" | "4K" =
        settings.server_api_image_size === "1K" || settings.server_api_image_size === "4K"
            ? settings.server_api_image_size
            : "2K"
    const enabled = settings.server_api_enabled === "true"
    const config = {
        provider,
        apiKey,
        model,
        imageSize,
        baseUrl: settings.server_api_base_url || undefined,
    }

    return {
        enabled,
        isReady: enabled && Boolean(apiKey),
        provider,
        config,
    }
}

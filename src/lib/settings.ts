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
        description: "网站统一 AI Provider（gemini/openai）",
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
        description: "网站统一 OpenAI 兼容接口 Base URL",
        is_encrypted: false,
    },
    {
        key: "server_api_model",
        value: "gemini-2.5-flash-image",
        description: "网站统一 AI 默认模型",
        is_encrypted: false,
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
    }
}

export async function getServerAiRuntimeConfig(): Promise<ServerAiRuntimeConfig> {
    const settings = await getSystemSettings([
        "server_api_enabled",
        "server_api_provider",
        "server_api_key",
        "server_api_base_url",
        "server_api_model",
    ])

    const provider: AIProvider = settings.server_api_provider === "openai" ? "openai" : "gemini"
    const apiKey = settings.server_api_key || ""
    const model = settings.server_api_model || (provider === "openai" ? "gpt-4o" : "gemini-2.5-flash-image")
    const enabled = settings.server_api_enabled === "true"
    const config = {
        provider,
        apiKey,
        model,
        baseUrl: provider === "openai"
            ? (settings.server_api_base_url || "https://api.openai.com/v1")
            : undefined,
    }

    return {
        enabled,
        isReady: enabled && Boolean(apiKey),
        provider,
        config,
    }
}

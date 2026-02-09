// 获取系统设置（仅读取，用于支付等模块）
// 不需要认证，但敏感字段不返回

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 获取指定的系统设置值（内部使用）
 */
export async function getSystemSetting(key: string): Promise<string | null> {
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

/**
 * 获取多个系统设置值（内部使用）
 */
export async function getSystemSettings(keys: string[]): Promise<Record<string, string>> {
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

/**
 * 检查支付是否启用
 */
export async function GET() {
    try {
        const enabled = await getSystemSetting("linuxdo_credit_enabled")
        return NextResponse.json({
            linuxdoCreditEnabled: enabled === "true"
        })
    } catch (error) {
        console.error("Get payment config error:", error)
        return NextResponse.json({ linuxdoCreditEnabled: false })
    }
}

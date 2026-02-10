// 系统设置 API
// 提供获取和更新系统配置的接口

import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/client"
import { requireAdmin } from "@/lib/auth/require-admin"
import { ensureSystemSettingsDefaults } from "@/lib/settings"

const supabaseAdmin = createServerClient()

function maskSecret(value: string): string {
    const secret = value.trim()
    if (!secret) return ""
    if (secret.length <= 4) return "*".repeat(secret.length)
    if (secret.length <= 8) return `${secret.slice(0, 2)}${"*".repeat(secret.length - 4)}${secret.slice(-2)}`
    return `${secret.slice(0, 4)}...${secret.slice(-4)}`
}

/**
 * 获取系统设置
 */
export async function GET() {
    try {
        const admin = await requireAdmin()
        if (!admin.ok) return admin.response
        await ensureSystemSettingsDefaults()

        const { data, error } = await supabaseAdmin
            .from("system_settings")
            .select("*")
            .order("key")

        if (error) {
            console.error("Get settings error:", error)
            return NextResponse.json({ error: "获取设置失败" }, { status: 500 })
        }

        // 隐藏加密字段的值（只返回是否已设置）
        const safeData = (data ?? []).map(item => ({
            ...item,
            value: item.is_encrypted ? (item.value ? "******" : "") : item.value,
            hasValue: !!item.value,
            maskedPreview: item.is_encrypted && item.value ? maskSecret(item.value) : "",
        }))

        return NextResponse.json({ settings: safeData })
    } catch (error) {
        console.error("Get settings error:", error)
        return NextResponse.json({ error: "获取设置失败" }, { status: 500 })
    }
}

/**
 * 更新系统设置
 */
export async function POST(request: Request) {
    try {
        const admin = await requireAdmin()
        if (!admin.ok) return admin.response
        await ensureSystemSettingsDefaults()

        const body = await request.json()
        const { key, value } = body

        if (!key) {
            return NextResponse.json({ error: "缺少 key 参数" }, { status: 400 })
        }

        const normalizedValue = typeof value === "string" ? value.trim() : value

        // 更新设置
        const { error } = await supabaseAdmin
            .from("system_settings")
            .upsert(
                {
                    key,
                    value: normalizedValue,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "key" }
            )

        if (error) {
            console.error("Update setting error:", error)
            return NextResponse.json({ error: "更新设置失败" }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Update setting error:", error)
        return NextResponse.json({ error: "更新设置失败" }, { status: 500 })
    }
}

/**
 * 批量更新系统设置
 */
export async function PUT(request: Request) {
    try {
        const admin = await requireAdmin()
        if (!admin.ok) return admin.response
        await ensureSystemSettingsDefaults()

        const body = await request.json()
        const { settings } = body as { settings: Array<{ key: string; value: string }> }

        if (!settings || !Array.isArray(settings)) {
            return NextResponse.json({ error: "无效的设置数据" }, { status: 400 })
        }

        // 批量更新
        for (const item of settings) {
            const normalizedValue = typeof item.value === "string" ? item.value.trim() : ""

            // 如果值是 "******"，跳过（不更新加密字段）
            if (normalizedValue === "******") continue

            const { error } = await supabaseAdmin
                .from("system_settings")
                .upsert(
                    {
                        key: item.key,
                        value: normalizedValue,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "key" }
                )

            if (error) {
                console.error("Batch update setting error:", item.key, error)
                return NextResponse.json({ error: `更新设置失败: ${item.key}` }, { status: 500 })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Batch update settings error:", error)
        return NextResponse.json({ error: "批量更新设置失败" }, { status: 500 })
    }
}

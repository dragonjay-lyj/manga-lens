import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"
import { getServerAiRuntimeConfig } from "@/lib/settings"
import { translateTextBatch, type BatchTranslateItem } from "@/lib/ai/text-translate"

type TranslateTextBody = {
    items?: BatchTranslateItem[]
    targetLanguage?: string
    contextHint?: string
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        await ensureUserRecord(userId)

        const body = (await request.json()) as TranslateTextBody
        const items = Array.isArray(body.items) ? body.items : []
        const targetLanguage = body.targetLanguage?.trim() || "简体中文"
        const contextHint = body.contextHint?.trim() || undefined
        if (!items.length) {
            return NextResponse.json({ success: true, items: [] })
        }

        const runtime = await getServerAiRuntimeConfig()
        if (!runtime.enabled) {
            return NextResponse.json({ error: "网站 API 未启用，请联系管理员" }, { status: 503 })
        }
        if (!runtime.isReady) {
            return NextResponse.json({ error: "网站 API 未完成配置，请联系管理员" }, { status: 503 })
        }

        const result = await translateTextBatch({
            items,
            targetLanguage,
            contextHint,
            config: runtime.config,
        })

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "批量翻译失败" },
                { status: 502 }
            )
        }

        return NextResponse.json({
            success: true,
            items: result.items,
            provider: runtime.provider,
            model: runtime.config.model,
        })
    } catch (error) {
        console.error("Server AI translate-text error:", error)
        return NextResponse.json({ error: "批量翻译失败" }, { status: 500 })
    }
}


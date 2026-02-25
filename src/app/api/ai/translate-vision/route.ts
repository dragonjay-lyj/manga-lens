import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"
import { getServerAiRuntimeConfig } from "@/lib/settings"
import { translateImageSentence } from "@/lib/ai/ai-service"

type TranslateVisionBody = {
    imageData?: string
    targetLanguage?: string
    sourceLanguageHint?: string
    extraPrompt?: string
    stripReasoningContent?: boolean
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        await ensureUserRecord(userId)

        const body = (await request.json()) as TranslateVisionBody
        const imageData = typeof body.imageData === "string" ? body.imageData.trim() : ""
        if (!imageData) {
            return NextResponse.json({ error: "缺少图片数据" }, { status: 400 })
        }
        const targetLanguage = body.targetLanguage?.trim() || "简体中文"
        const sourceLanguageHint = body.sourceLanguageHint?.trim() || undefined
        const extraPrompt = body.extraPrompt?.trim() || undefined
        const stripReasoningContent = Boolean(body.stripReasoningContent)

        const runtime = await getServerAiRuntimeConfig()
        if (!runtime.enabled) {
            return NextResponse.json({ error: "网站 API 未启用，请联系管理员" }, { status: 503 })
        }
        if (!runtime.isReady) {
            return NextResponse.json({ error: "网站 API 未完成配置，请联系管理员" }, { status: 503 })
        }

        const result = await translateImageSentence({
            imageData,
            targetLanguage,
            sourceLanguageHint,
            extraPrompt,
            stripReasoningContent,
            config: runtime.config,
        })

        if (!result.success || !result.translatedText) {
            return NextResponse.json(
                { error: result.error || "截图翻译失败", raw: result.raw },
                { status: 502 }
            )
        }

        return NextResponse.json({
            success: true,
            translatedText: result.translatedText,
            raw: result.raw,
            provider: runtime.provider,
            model: runtime.config.model,
        })
    } catch (error) {
        console.error("Server AI translate-vision error:", error)
        return NextResponse.json({ error: "截图翻译失败" }, { status: 500 })
    }
}

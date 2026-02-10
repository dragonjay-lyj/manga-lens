import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"
import { generateImage, type ImageSizeOption } from "@/lib/ai/ai-service"
import { getServerAiRuntimeConfig } from "@/lib/settings"

type GenerateBody = {
    imageData?: string
    prompt?: string
    imageSize?: string
}

function parseImageSize(value?: string): ImageSizeOption | undefined {
    const normalized = value?.trim().toUpperCase()
    if (normalized === "1K" || normalized === "2K" || normalized === "4K") {
        return normalized
    }
    return undefined
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await ensureUserRecord(userId)

        const body = (await request.json()) as GenerateBody
        const imageData = body.imageData?.trim()
        const prompt = body.prompt?.trim()
        const imageSize = parseImageSize(body.imageSize)
        if (!imageData || !prompt) {
            return NextResponse.json({ error: "缺少 imageData 或 prompt" }, { status: 400 })
        }
        if (body.imageSize && !imageSize) {
            return NextResponse.json({ error: "imageSize 仅支持 1K/2K/4K" }, { status: 400 })
        }

        const runtime = await getServerAiRuntimeConfig()
        if (!runtime.enabled) {
            return NextResponse.json({ error: "网站 API 未启用，请联系管理员" }, { status: 503 })
        }
        if (!runtime.isReady) {
            return NextResponse.json({ error: "网站 API 未完成配置，请联系管理员" }, { status: 503 })
        }

        const result = await generateImage({
            imageData,
            prompt,
            config: {
                ...runtime.config,
                imageSize: (imageSize || runtime.config.imageSize),
            },
        })

        if (!result.success || !result.imageData) {
            return NextResponse.json(
                { error: result.error || "网站 API 生成失败" },
                { status: 502 }
            )
        }

        return NextResponse.json({
            success: true,
            imageData: result.imageData,
            provider: runtime.provider,
            model: runtime.config.model,
        })
    } catch (error) {
        console.error("Server AI generate error:", error)
        return NextResponse.json({ error: "生成失败" }, { status: 500 })
    }
}

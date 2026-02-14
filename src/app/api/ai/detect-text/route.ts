import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"
import { detectTextBlocks } from "@/lib/ai/ai-service"
import { detectTextWithComicTextDetector } from "@/lib/ai/comic-text-detector"
import { getServerAiRuntimeConfig, getSystemSettings } from "@/lib/settings"

type DetectBody = {
    imageData?: string
    targetLanguage?: string
    imageWidth?: number
    imageHeight?: number
    preferComicDetector?: boolean
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await ensureUserRecord(userId)

        const body = (await request.json()) as DetectBody
        const imageData = body.imageData?.trim()
        if (!imageData) {
            return NextResponse.json({ error: "缺少 imageData" }, { status: 400 })
        }

        const detectorSettings = await getSystemSettings([
            "comic_text_detector_enabled",
            "comic_text_detector_base_url",
            "comic_text_detector_api_key",
        ])
        const preferComicDetector = body.preferComicDetector !== false
        const comicDetectorEnabled = detectorSettings.comic_text_detector_enabled === "true"
        const comicDetectorBaseUrl =
            detectorSettings.comic_text_detector_base_url ||
            process.env.COMIC_TEXT_DETECTOR_BASE_URL ||
            ""
        const comicDetectorApiKey =
            detectorSettings.comic_text_detector_api_key ||
            process.env.COMIC_TEXT_DETECTOR_API_KEY ||
            ""

        if (preferComicDetector && comicDetectorEnabled && comicDetectorBaseUrl) {
            const detectorResult = await detectTextWithComicTextDetector(
                {
                    baseUrl: comicDetectorBaseUrl,
                    apiKey: comicDetectorApiKey,
                },
                {
                    imageData,
                    targetLanguage: body.targetLanguage || "简体中文",
                    imageWidth: Number.isFinite(body.imageWidth) ? body.imageWidth : undefined,
                    imageHeight: Number.isFinite(body.imageHeight) ? body.imageHeight : undefined,
                }
            )

            if (detectorResult.success) {
                const lineCount = detectorResult.blocks.reduce((sum, block) => sum + (block.lines?.length || 0), 0)
                const segmentCount = detectorResult.blocks.reduce((sum, block) => sum + (block.segments?.length || 0), 0)
                return NextResponse.json({
                    success: true,
                    blocks: detectorResult.blocks,
                    summary: {
                        blockCount: detectorResult.blocks.length,
                        lineCount,
                        segmentCount,
                    },
                    provider: "comic-text-detector",
                    model: "comic-text-detector",
                })
            }
        }

        const runtime = await getServerAiRuntimeConfig()
        if (!runtime.enabled) {
            return NextResponse.json({ error: "网站 API 未启用，请联系管理员" }, { status: 503 })
        }
        if (!runtime.isReady) {
            return NextResponse.json({ error: "网站 API 未完成配置，请联系管理员" }, { status: 503 })
        }

        const result = await detectTextBlocks({
            imageData,
            config: runtime.config,
            targetLanguage: body.targetLanguage || "简体中文",
        })

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "网站 API 文本检测失败", blocks: [] },
                { status: 502 }
            )
        }

        const lineCount = result.blocks.reduce((sum, block) => sum + (block.lines?.length || 0), 0)
        const segmentCount = result.blocks.reduce((sum, block) => sum + (block.segments?.length || 0), 0)
        return NextResponse.json({
            success: true,
            blocks: result.blocks,
            summary: {
                blockCount: result.blocks.length,
                lineCount,
                segmentCount,
            },
            provider: runtime.provider,
            model: runtime.config.model,
        })
    } catch (error) {
        console.error("Server AI detect-text error:", error)
        return NextResponse.json({ error: "文本检测失败" }, { status: 500 })
    }
}

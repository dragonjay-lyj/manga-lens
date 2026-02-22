import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { auth } from "@clerk/nextjs/server"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"
import type { DetectedTextBlock, SourceLanguageCode, TextDetectionRegion } from "@/lib/ai/ai-service"
import {
    detectTextBlocks,
    filterBlocksBySourceLanguageAllowlist,
    normalizeSourceLanguageAllowlist,
} from "@/lib/ai/ai-service"
import { detectTextWithComicTextDetector } from "@/lib/ai/comic-text-detector"
import { getServerAiRuntimeConfig, getSystemSettings } from "@/lib/settings"

type DetectBody = {
    imageData?: string
    targetLanguage?: string
    sourceLanguageHint?: string
    sourceLanguageAllowlist?: unknown
    imageWidth?: number
    imageHeight?: number
    includeRegions?: unknown
    excludeRegions?: unknown
    preferComicDetector?: boolean
}

type DetectResponseSummary = {
    blockCount: number
    lineCount: number
    segmentCount: number
}

type DetectResponsePayload = {
    blocks: DetectedTextBlock[]
    summary: DetectResponseSummary
    provider: string
    model: string
}

type DetectCacheEntry = {
    expiresAt: number
    payload: DetectResponsePayload
}

const DETECT_CACHE_TTL_MS = 30 * 60 * 1000
const DETECT_CACHE_MAX_ENTRIES = 200
const detectResponseCache = new Map<string, DetectCacheEntry>()

function clamp01(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

function normalizeRegions(input: unknown): TextDetectionRegion[] {
    if (!Array.isArray(input)) return []
    return input.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const region = item as Record<string, unknown>
        const x = Number(region.x)
        const y = Number(region.y)
        const width = Number(region.width)
        const height = Number(region.height)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
            return []
        }
        const normalized = {
            x: clamp01(x),
            y: clamp01(y),
            width: clamp01(width),
            height: clamp01(height),
        }
        if (normalized.width <= 0 || normalized.height <= 0) return []
        return [normalized]
    })
}

function intersectsRegion(a: TextDetectionRegion, b: TextDetectionRegion): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

function filterBlocksByRegions(
    blocks: DetectedTextBlock[],
    includeRegions: TextDetectionRegion[],
    excludeRegions: TextDetectionRegion[]
): DetectedTextBlock[] {
    if (!includeRegions.length && !excludeRegions.length) return blocks
    return blocks.filter((block) => {
        const bbox: TextDetectionRegion = {
            x: block.bbox.x,
            y: block.bbox.y,
            width: block.bbox.width,
            height: block.bbox.height,
        }
        if (includeRegions.length && !includeRegions.some((region) => intersectsRegion(bbox, region))) {
            return false
        }
        if (excludeRegions.length && excludeRegions.some((region) => intersectsRegion(bbox, region))) {
            return false
        }
        return true
    })
}

function normalizeSourceLanguageAllowlistInput(input: unknown): SourceLanguageCode[] {
    if (!Array.isArray(input)) return []
    return normalizeSourceLanguageAllowlist(input.map((item) => String(item)))
}

function summarizeBlocks(blocks: DetectedTextBlock[]): DetectResponseSummary {
    const lineCount = blocks.reduce((sum, block) => sum + (block.lines?.length || 0), 0)
    const segmentCount = blocks.reduce((sum, block) => sum + (block.segments?.length || 0), 0)
    return {
        blockCount: blocks.length,
        lineCount,
        segmentCount,
    }
}

function stableRegionsKey(regions: TextDetectionRegion[]): string {
    if (!regions.length) return ""
    return regions
        .map((region) =>
            `${region.x.toFixed(4)},${region.y.toFixed(4)},${region.width.toFixed(4)},${region.height.toFixed(4)}`
        )
        .join("|")
}

function buildDetectCacheKey(input: {
    imageData: string
    targetLanguage: string
    sourceLanguageHint?: string
    sourceLanguageAllowlist: SourceLanguageCode[]
    imageWidth?: number
    imageHeight?: number
    includeRegions: TextDetectionRegion[]
    excludeRegions: TextDetectionRegion[]
    preferComicDetector: boolean
}): string {
    const imageHash = createHash("sha1")
        .update(input.imageData.replace(/^data:image\/\w+;base64,/, ""))
        .digest("hex")
    return [
        imageHash,
        input.targetLanguage,
        input.sourceLanguageHint || "",
        input.sourceLanguageAllowlist.slice().sort().join(","),
        input.imageWidth ? String(Math.round(input.imageWidth)) : "",
        input.imageHeight ? String(Math.round(input.imageHeight)) : "",
        stableRegionsKey(input.includeRegions),
        stableRegionsKey(input.excludeRegions),
        input.preferComicDetector ? "1" : "0",
    ].join("::")
}

function getCachedDetectPayload(cacheKey: string): DetectResponsePayload | null {
    const hit = detectResponseCache.get(cacheKey)
    if (!hit) return null
    if (hit.expiresAt < Date.now()) {
        detectResponseCache.delete(cacheKey)
        return null
    }
    return {
        ...hit.payload,
        blocks: hit.payload.blocks.map((block) => ({
            ...block,
            bbox: { ...block.bbox },
            lines: block.lines ? [...block.lines] : undefined,
            segments: block.segments?.map((segment) => ({ ...segment })),
            style: block.style ? { ...block.style } : undefined,
        })),
    }
}

function setCachedDetectPayload(cacheKey: string, payload: DetectResponsePayload): void {
    if (detectResponseCache.size >= DETECT_CACHE_MAX_ENTRIES) {
        const firstKey = detectResponseCache.keys().next().value
        if (firstKey) {
            detectResponseCache.delete(firstKey)
        }
    }
    detectResponseCache.set(cacheKey, {
        expiresAt: Date.now() + DETECT_CACHE_TTL_MS,
        payload: {
            ...payload,
            blocks: payload.blocks.map((block) => ({
                ...block,
                bbox: { ...block.bbox },
                lines: block.lines ? [...block.lines] : undefined,
                segments: block.segments?.map((segment) => ({ ...segment })),
                style: block.style ? { ...block.style } : undefined,
            })),
        },
    })
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
        const targetLanguage = body.targetLanguage || "简体中文"
        const includeRegions = normalizeRegions(body.includeRegions)
        const excludeRegions = normalizeRegions(body.excludeRegions)
        const sourceLanguageAllowlist = normalizeSourceLanguageAllowlistInput(body.sourceLanguageAllowlist)
        const sourceLanguageHint = body.sourceLanguageHint?.trim() || undefined
        const preferComicDetector = body.preferComicDetector !== false
        if (!imageData) {
            return NextResponse.json({ error: "缺少 imageData" }, { status: 400 })
        }

        const cacheKey = buildDetectCacheKey({
            imageData,
            targetLanguage,
            sourceLanguageHint,
            sourceLanguageAllowlist,
            imageWidth: Number.isFinite(body.imageWidth) ? body.imageWidth : undefined,
            imageHeight: Number.isFinite(body.imageHeight) ? body.imageHeight : undefined,
            includeRegions,
            excludeRegions,
            preferComicDetector,
        })
        const cachedPayload = getCachedDetectPayload(cacheKey)
        if (cachedPayload) {
            return NextResponse.json({
                success: true,
                blocks: cachedPayload.blocks,
                summary: cachedPayload.summary,
                provider: cachedPayload.provider,
                model: cachedPayload.model,
                cacheHit: true,
            })
        }

        const detectorSettings = await getSystemSettings([
            "comic_text_detector_enabled",
            "comic_text_detector_base_url",
            "comic_text_detector_api_key",
        ])
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
                    targetLanguage,
                    imageWidth: Number.isFinite(body.imageWidth) ? body.imageWidth : undefined,
                    imageHeight: Number.isFinite(body.imageHeight) ? body.imageHeight : undefined,
                }
            )

            if (detectorResult.success) {
                const filteredBlocks = filterBlocksBySourceLanguageAllowlist(
                    filterBlocksByRegions(
                        detectorResult.blocks,
                        includeRegions,
                        excludeRegions
                    ),
                    sourceLanguageAllowlist
                )
                const payload: DetectResponsePayload = {
                    blocks: filteredBlocks,
                    summary: summarizeBlocks(filteredBlocks),
                    provider: "comic-text-detector",
                    model: "comic-text-detector",
                }
                setCachedDetectPayload(cacheKey, payload)
                return NextResponse.json({
                    success: true,
                    blocks: payload.blocks,
                    summary: payload.summary,
                    provider: payload.provider,
                    model: payload.model,
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
            targetLanguage,
            sourceLanguageHint,
            sourceLanguageAllowlist,
            includeRegions,
            excludeRegions,
        })

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "网站 API 文本检测失败", blocks: [] },
                { status: 502 }
            )
        }

        const payload: DetectResponsePayload = {
            blocks: result.blocks,
            summary: summarizeBlocks(result.blocks),
            provider: runtime.provider,
            model: runtime.config.model || "",
        }
        setCachedDetectPayload(cacheKey, payload)
        return NextResponse.json({
            success: true,
            blocks: payload.blocks,
            summary: payload.summary,
            provider: payload.provider,
            model: payload.model,
        })
    } catch (error) {
        console.error("Server AI detect-text error:", error)
        return NextResponse.json({ error: "文本检测失败" }, { status: 500 })
    }
}

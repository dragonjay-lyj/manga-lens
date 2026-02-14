import type { DetectedTextBlock } from "@/lib/ai/ai-service"

type DetectorSize = {
    width?: number
    height?: number
}

type ComicTextDetectorConfig = {
    baseUrl: string
    apiKey?: string
    timeoutMs?: number
}

type ComicTextDetectorRequest = {
    imageData: string
    targetLanguage?: string
    imageWidth?: number
    imageHeight?: number
}

export type ComicTextDetectorResult = {
    success: boolean
    blocks: DetectedTextBlock[]
    error?: string
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

function normalizeCoordinate(value: number, size?: number): number {
    if (value <= 1) return clamp01(value)
    if (size && size > 0) return clamp01(value / size)
    if (value <= 100) return clamp01(value / 100)
    return clamp01(value)
}

function normalizeLength(value: number, size?: number): number {
    if (value <= 1) return clamp01(value)
    if (size && size > 0) return clamp01(value / size)
    if (value <= 100) return clamp01(value / 100)
    return clamp01(value)
}

function detectImageSize(payload: unknown, fallback: DetectorSize): DetectorSize {
    const source = (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : {}
    const width =
        toNumber(source.imageWidth) ??
        toNumber(source.image_width) ??
        toNumber(source.width) ??
        fallback.width
    const height =
        toNumber(source.imageHeight) ??
        toNumber(source.image_height) ??
        toNumber(source.height) ??
        fallback.height
    return { width: width ?? undefined, height: height ?? undefined }
}

function getObjectList(payload: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(payload)) {
        return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    }

    if (!payload || typeof payload !== "object") {
        return []
    }

    const source = payload as Record<string, unknown>
    const candidateKeys = [
        "blocks",
        "detections",
        "results",
        "text_blocks",
        "annotations",
        "instances",
        "data",
    ]

    for (const key of candidateKeys) {
        const value = source[key]
        if (Array.isArray(value)) {
            return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        }
    }

    return []
}

function toPoint(value: unknown): { x: number; y: number } | null {
    if (Array.isArray(value) && value.length >= 2) {
        const x = toNumber(value[0])
        const y = toNumber(value[1])
        if (x !== null && y !== null) {
            return { x, y }
        }
        return null
    }

    if (value && typeof value === "object") {
        const source = value as Record<string, unknown>
        const x = toNumber(source.x ?? source[0])
        const y = toNumber(source.y ?? source[1])
        if (x !== null && y !== null) {
            return { x, y }
        }
    }

    return null
}

function extractBBox(item: Record<string, unknown>, size: DetectorSize): DetectedTextBlock["bbox"] | null {
    const width = size.width
    const height = size.height

    const bboxRaw = item.bbox ?? item.box ?? item.bounds ?? item.rect
    if (Array.isArray(bboxRaw) && bboxRaw.length >= 4) {
        const n0 = toNumber(bboxRaw[0])
        const n1 = toNumber(bboxRaw[1])
        const n2 = toNumber(bboxRaw[2])
        const n3 = toNumber(bboxRaw[3])
        if (n0 !== null && n1 !== null && n2 !== null && n3 !== null) {
            const assumeXYXY = n2 > n0 && n3 > n1
            const x = normalizeCoordinate(n0, width)
            const y = normalizeCoordinate(n1, height)
            const w = assumeXYXY
                ? normalizeLength(n2 - n0, width)
                : normalizeLength(n2, width)
            const h = assumeXYXY
                ? normalizeLength(n3 - n1, height)
                : normalizeLength(n3, height)
            if (w > 0 && h > 0) return { x, y, width: w, height: h }
        }
    }

    if (Array.isArray(item.xyxy) && item.xyxy.length >= 4) {
        const x1 = toNumber(item.xyxy[0])
        const y1 = toNumber(item.xyxy[1])
        const x2 = toNumber(item.xyxy[2])
        const y2 = toNumber(item.xyxy[3])
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null && x2 > x1 && y2 > y1) {
            return {
                x: normalizeCoordinate(x1, width),
                y: normalizeCoordinate(y1, height),
                width: normalizeLength(x2 - x1, width),
                height: normalizeLength(y2 - y1, height),
            }
        }
    }

    if (bboxRaw && typeof bboxRaw === "object") {
        const bboxObj = bboxRaw as Record<string, unknown>
        const x = toNumber(bboxObj.x ?? bboxObj.left ?? bboxObj.x1)
        const y = toNumber(bboxObj.y ?? bboxObj.top ?? bboxObj.y1)
        const w = toNumber(bboxObj.width ?? bboxObj.w)
        const h = toNumber(bboxObj.height ?? bboxObj.h)
        const right = toNumber(bboxObj.right ?? bboxObj.x2)
        const bottom = toNumber(bboxObj.bottom ?? bboxObj.y2)

        if (x !== null && y !== null) {
            const resolvedWidth = w ?? (right !== null ? right - x : null)
            const resolvedHeight = h ?? (bottom !== null ? bottom - y : null)
            if (resolvedWidth !== null && resolvedHeight !== null && resolvedWidth > 0 && resolvedHeight > 0) {
                return {
                    x: normalizeCoordinate(x, width),
                    y: normalizeCoordinate(y, height),
                    width: normalizeLength(resolvedWidth, width),
                    height: normalizeLength(resolvedHeight, height),
                }
            }
        }
    }

    const x1 = toNumber(item.x1 ?? item.left)
    const y1 = toNumber(item.y1 ?? item.top)
    const x2 = toNumber(item.x2 ?? item.right)
    const y2 = toNumber(item.y2 ?? item.bottom)
    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null && x2 > x1 && y2 > y1) {
        return {
            x: normalizeCoordinate(x1, width),
            y: normalizeCoordinate(y1, height),
            width: normalizeLength(x2 - x1, width),
            height: normalizeLength(y2 - y1, height),
        }
    }

    const pointsRaw = item.points ?? item.polygon ?? item.poly
    if (Array.isArray(pointsRaw) && pointsRaw.length >= 2) {
        const points = pointsRaw
            .map((point) => toPoint(point))
            .filter((point): point is { x: number; y: number } => Boolean(point))
        if (points.length >= 2) {
            const minX = Math.min(...points.map((p) => p.x))
            const maxX = Math.max(...points.map((p) => p.x))
            const minY = Math.min(...points.map((p) => p.y))
            const maxY = Math.max(...points.map((p) => p.y))
            if (maxX > minX && maxY > minY) {
                return {
                    x: normalizeCoordinate(minX, width),
                    y: normalizeCoordinate(minY, height),
                    width: normalizeLength(maxX - minX, width),
                    height: normalizeLength(maxY - minY, height),
                }
            }
        }
    }

    return null
}

function normalizeBlocks(payload: unknown, size: DetectorSize): DetectedTextBlock[] {
    const resolvedSize = detectImageSize(payload, size)
    const objects = getObjectList(payload)
    const result: DetectedTextBlock[] = []
    const dedupe = new Set<string>()

    for (const item of objects) {
        const bbox = extractBBox(item, resolvedSize)
        if (!bbox) continue
        if (bbox.width <= 0 || bbox.height <= 0) continue

        const sourceText = String(
            item.sourceText ??
            item.source_text ??
            item.text ??
            item.raw_text ??
            item.ocr_text ??
            ""
        ).trim()

        const translatedText = String(
            item.translatedText ??
            item.translated_text ??
            item.translation ??
            item.translated ??
            ""
        ).trim()

        const sourceLanguage = String(
            item.sourceLanguage ??
            item.source_language ??
            item.lang ??
            ""
        ).trim() || undefined

        const lines = Array.isArray(item.lines)
            ? item.lines.map((line) => String(line ?? "").trim()).filter(Boolean)
            : Array.isArray(item.line_texts)
                ? (item.line_texts as unknown[]).map((line) => String(line ?? "").trim()).filter(Boolean)
                : undefined

        const segmentRaw = Array.isArray(item.segments)
            ? item.segments
            : Array.isArray(item.segment_boxes)
                ? item.segment_boxes
                : []
        const segments = (segmentRaw as unknown[]).flatMap((segment) => {
            if (!segment || typeof segment !== "object") return []
            const s = segment as Record<string, unknown>
            const x = toNumber(s.x ?? s.left)
            const y = toNumber(s.y ?? s.top)
            const width = toNumber(s.width ?? s.w)
            const height = toNumber(s.height ?? s.h)
            if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return []
            return [{
                x: clamp01(normalizeCoordinate(x, resolvedSize.width)),
                y: clamp01(normalizeCoordinate(y, resolvedSize.height)),
                width: clamp01(normalizeLength(width, resolvedSize.width)),
                height: clamp01(normalizeLength(height, resolvedSize.height)),
            }]
        })

        const styleRaw = (item.style ?? item.styleHints ?? item.layout) as Record<string, unknown> | undefined
        const style = styleRaw
            ? {
                textColor: typeof styleRaw.textColor === "string" ? styleRaw.textColor : (typeof styleRaw.color === "string" ? styleRaw.color : undefined),
                outlineColor: typeof styleRaw.outlineColor === "string" ? styleRaw.outlineColor : (typeof styleRaw.strokeColor === "string" ? styleRaw.strokeColor : undefined),
                strokeColor: typeof styleRaw.strokeColor === "string" ? styleRaw.strokeColor : (typeof styleRaw.outlineColor === "string" ? styleRaw.outlineColor : undefined),
                strokeWidth: toNumber(styleRaw.strokeWidth ?? styleRaw.stroke_width) ?? undefined,
                textOpacity: toNumber(styleRaw.textOpacity ?? styleRaw.opacity) ?? undefined,
                fontFamily: typeof styleRaw.fontFamily === "string" ? styleRaw.fontFamily : undefined,
                angle: toNumber(styleRaw.angle ?? styleRaw.rotation) ?? undefined,
                orientation: typeof styleRaw.orientation === "string" ? styleRaw.orientation as "vertical" | "horizontal" | "auto" : undefined,
                alignment: typeof styleRaw.alignment === "string" ? styleRaw.alignment as "start" | "center" | "end" | "justify" | "auto" : undefined,
                fontWeight: typeof styleRaw.fontWeight === "string" ? styleRaw.fontWeight : undefined,
            }
            : undefined

        const key = [
            bbox.x.toFixed(4),
            bbox.y.toFixed(4),
            bbox.width.toFixed(4),
            bbox.height.toFixed(4),
            sourceText,
        ].join("|")
        if (dedupe.has(key)) continue
        dedupe.add(key)

        result.push({
            sourceText,
            translatedText,
            bbox,
            sourceLanguage,
            lines: lines?.length ? lines : undefined,
            segments: segments.length ? segments : undefined,
            style,
        })
    }

    return result
}

function stripDataUrlPrefix(imageData: string): string {
    return imageData.replace(/^data:image\/\w+;base64,/, "")
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timer)
    }
}

async function parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
        return response.json()
    }
    const text = await response.text()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return { raw: text }
    }
}

export async function detectTextWithComicTextDetector(
    config: ComicTextDetectorConfig,
    request: ComicTextDetectorRequest
): Promise<ComicTextDetectorResult> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "")
    if (!baseUrl) {
        return {
            success: false,
            blocks: [],
            error: "comic-text-detector 未配置地址",
        }
    }

    const timeoutMs = Math.max(3_000, config.timeoutMs ?? 25_000)
    const rawBase64 = stripDataUrlPrefix(request.imageData)
    const requestSize: DetectorSize = {
        width: request.imageWidth,
        height: request.imageHeight,
    }

    const endpoints = [
        "/detect",
        "/api/detect",
        "/predict",
        "/api/predict",
    ]

    const authHeaders: Record<string, string> = {}
    if (config.apiKey) {
        authHeaders.Authorization = `Bearer ${config.apiKey}`
        authHeaders["X-API-Key"] = config.apiKey
    }

    const jsonPayloads: Array<Record<string, unknown>> = [
        { image: rawBase64, target_language: request.targetLanguage || "zh" },
        { imageData: rawBase64, target_language: request.targetLanguage || "zh" },
        { image_base64: rawBase64, target_language: request.targetLanguage || "zh" },
    ]

    const errors: string[] = []

    for (const endpoint of endpoints) {
        const url = `${baseUrl}${endpoint}`

        for (const payload of jsonPayloads) {
            try {
                const response = await fetchWithTimeout(
                    url,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...authHeaders,
                        },
                        body: JSON.stringify(payload),
                    },
                    timeoutMs
                )

                if (!response.ok) {
                    const body = await response.text().catch(() => "")
                    errors.push(`${endpoint} ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`)
                    continue
                }

                const parsed = await parseResponse(response)
                const blocks = normalizeBlocks(parsed, requestSize)
                if (blocks.length > 0) {
                    return { success: true, blocks }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                errors.push(`${endpoint}: ${message}`)
            }
        }
    }

    return {
        success: false,
        blocks: [],
        error: errors.length
            ? `comic-text-detector 调用失败: ${errors[0]}`
            : "comic-text-detector 未返回可用文本框",
    }
}

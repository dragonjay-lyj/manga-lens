import type { DetectedTextBlock } from "@/lib/ai/ai-service"

export type ExternalOcrEngine = "manga_ocr" | "paddle_ocr" | "baidu_ocr"

export type ExternalOcrRequest = {
    imageData: string
    targetLanguage?: string
    imageWidth?: number
    imageHeight?: number
}

export type HttpOcrAdapterConfig = {
    baseUrl: string
    apiKey?: string
    timeoutMs?: number
}

export type BaiduOcrAdapterConfig = {
    apiKey: string
    secretKey: string
    endpoint?: string
    timeoutMs?: number
}

export type ExternalOcrResult = {
    success: boolean
    blocks: DetectedTextBlock[]
    provider: string
    model: string
    error?: string
}

type DetectorSize = {
    width?: number
    height?: number
}

type PaddleEntry = {
    text: string
    points: Array<{ x: number; y: number }>
}

const DEFAULT_TIMEOUT_MS = 25_000
const BAIDU_TOKEN_ENDPOINT = "https://aip.baidubce.com/oauth/2.0/token"
const BAIDU_OCR_ENDPOINT = "https://aip.baidubce.com/rest/2.0/ocr/v1/general"
const baiduTokenCache = new Map<string, { token: string; expiresAt: number }>()

function stripDataUrlPrefix(imageData: string): string {
    return imageData.replace(/^data:image\/\w+;base64,/, "")
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
        "items",
        "words_result",
    ]

    for (const key of candidateKeys) {
        const value = source[key]
        if (Array.isArray(value)) {
            return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        }
    }

    return []
}

function normalizeGenericBlocks(payload: unknown, size: DetectorSize): DetectedTextBlock[] {
    const resolvedSize = detectImageSize(payload, size)
    const objects = getObjectList(payload)
    const result: DetectedTextBlock[] = []
    const dedupe = new Set<string>()

    for (const item of objects) {
        const sourceText = String(
            item.sourceText ??
            item.source_text ??
            item.text ??
            item.words ??
            item.raw_text ??
            item.ocr_text ??
            ""
        ).trim()
        if (!sourceText) continue

        const bbox = extractBBox(item, resolvedSize)
        if (!bbox || bbox.width <= 0 || bbox.height <= 0) continue

        const key = [
            sourceText,
            bbox.x.toFixed(4),
            bbox.y.toFixed(4),
            bbox.width.toFixed(4),
            bbox.height.toFixed(4),
        ].join("|")
        if (dedupe.has(key)) continue
        dedupe.add(key)

        result.push({
            sourceText,
            translatedText: String(item.translatedText ?? item.translated_text ?? item.translation ?? "").trim() || sourceText,
            sourceLanguage: String(item.sourceLanguage ?? item.source_language ?? item.lang ?? "").trim() || undefined,
            bbox,
        })
    }

    return result
}

function isPaddlePolygon(value: unknown): value is Array<{ x: number; y: number }> {
    if (!Array.isArray(value) || value.length < 3) return false
    const points = value.map((item) => toPoint(item))
    return points.every(Boolean)
}

function collectPaddleEntries(payload: unknown, result: PaddleEntry[], depth = 0): void {
    if (depth > 8 || !Array.isArray(payload)) return

    const polygonCandidate = payload[0]
    const textCandidate = payload[1]
    if (isPaddlePolygon(polygonCandidate)) {
        const points = polygonCandidate.map((point) => toPoint(point)).filter((point): point is { x: number; y: number } => Boolean(point))
        const text =
            typeof textCandidate === "string"
                ? textCandidate
                : (Array.isArray(textCandidate) && typeof textCandidate[0] === "string")
                    ? String(textCandidate[0])
                    : ""
        if (text.trim() && points.length >= 3) {
            result.push({ text: text.trim(), points })
            return
        }
    }

    for (const item of payload) {
        collectPaddleEntries(item, result, depth + 1)
    }
}

function normalizePaddleBlocks(payload: unknown, size: DetectorSize): DetectedTextBlock[] {
    const resolvedSize = detectImageSize(payload, size)
    const entries: PaddleEntry[] = []
    collectPaddleEntries(payload, entries)
    if (!entries.length && payload && typeof payload === "object") {
        const source = payload as Record<string, unknown>
        if (Array.isArray(source.data)) {
            collectPaddleEntries(source.data, entries)
        } else if (Array.isArray(source.result)) {
            collectPaddleEntries(source.result, entries)
        }
    }
    if (!entries.length) return normalizeGenericBlocks(payload, resolvedSize)

    const dedupe = new Set<string>()
    const blocks: DetectedTextBlock[] = []
    for (const entry of entries) {
        const minX = Math.min(...entry.points.map((point) => point.x))
        const maxX = Math.max(...entry.points.map((point) => point.x))
        const minY = Math.min(...entry.points.map((point) => point.y))
        const maxY = Math.max(...entry.points.map((point) => point.y))
        if (maxX <= minX || maxY <= minY) continue
        const bbox = {
            x: normalizeCoordinate(minX, resolvedSize.width),
            y: normalizeCoordinate(minY, resolvedSize.height),
            width: normalizeLength(maxX - minX, resolvedSize.width),
            height: normalizeLength(maxY - minY, resolvedSize.height),
        }
        if (bbox.width <= 0 || bbox.height <= 0) continue
        const key = [
            entry.text,
            bbox.x.toFixed(4),
            bbox.y.toFixed(4),
            bbox.width.toFixed(4),
            bbox.height.toFixed(4),
        ].join("|")
        if (dedupe.has(key)) continue
        dedupe.add(key)
        blocks.push({
            sourceText: entry.text,
            translatedText: entry.text,
            bbox,
        })
    }
    return blocks
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

async function parseUnknownResponse(response: Response): Promise<unknown> {
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

async function runHttpOcrEngine(
    config: HttpOcrAdapterConfig,
    request: ExternalOcrRequest,
    options: {
        provider: string
        model: string
        endpoints: string[]
        buildPayloads: (rawBase64: string, targetLanguage: string) => Array<Record<string, unknown>>
        normalize: (payload: unknown, size: DetectorSize) => DetectedTextBlock[]
    }
): Promise<ExternalOcrResult> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "")
    if (!baseUrl) {
        return {
            success: false,
            blocks: [],
            provider: options.provider,
            model: options.model,
            error: `${options.provider} 未配置服务地址`,
        }
    }

    const timeoutMs = Math.max(3_000, config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const rawBase64 = stripDataUrlPrefix(request.imageData)
    const targetLanguage = request.targetLanguage || "zh"
    const imageSize: DetectorSize = {
        width: request.imageWidth,
        height: request.imageHeight,
    }

    const authHeaders: Record<string, string> = {}
    if (config.apiKey) {
        authHeaders.Authorization = `Bearer ${config.apiKey}`
        authHeaders["X-API-Key"] = config.apiKey
    }

    const errors: string[] = []
    const payloads = options.buildPayloads(rawBase64, targetLanguage)

    for (const endpoint of options.endpoints) {
        const url = `${baseUrl}${endpoint}`
        for (const payload of payloads) {
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

                const parsed = await parseUnknownResponse(response)
                const blocks = options.normalize(parsed, imageSize)
                if (blocks.length > 0) {
                    return {
                        success: true,
                        blocks,
                        provider: options.provider,
                        model: options.model,
                    }
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
        provider: options.provider,
        model: options.model,
        error: errors.length
            ? `${options.provider} 调用失败: ${errors[0]}`
            : `${options.provider} 未返回可用文本框`,
    }
}

async function getBaiduAccessToken(config: BaiduOcrAdapterConfig): Promise<string> {
    const cacheKey = `${config.apiKey}::${config.secretKey}`
    const cached = baiduTokenCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now() + 5_000) {
        return cached.token
    }

    const timeoutMs = Math.max(3_000, config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const tokenUrl = `${BAIDU_TOKEN_ENDPOINT}?grant_type=client_credentials&client_id=${encodeURIComponent(config.apiKey)}&client_secret=${encodeURIComponent(config.secretKey)}`
    const response = await fetchWithTimeout(tokenUrl, { method: "POST" }, timeoutMs)
    const parsed = await parseUnknownResponse(response) as Record<string, unknown> | null
    if (!response.ok) {
        const message = parsed && typeof parsed.error_description === "string"
            ? parsed.error_description
            : `HTTP ${response.status}`
        throw new Error(`百度 access_token 获取失败: ${message}`)
    }

    const accessToken = parsed && typeof parsed.access_token === "string" ? parsed.access_token : ""
    if (!accessToken) {
        throw new Error("百度 access_token 响应缺少 access_token")
    }

    const expiresIn = parsed && typeof parsed.expires_in === "number" ? parsed.expires_in : 2_592_000
    baiduTokenCache.set(cacheKey, {
        token: accessToken,
        expiresAt: Date.now() + Math.max(60_000, expiresIn * 1000),
    })
    return accessToken
}

function normalizeBaiduBlocks(payload: unknown, size: DetectorSize): DetectedTextBlock[] {
    if (!payload || typeof payload !== "object") return []
    const source = payload as Record<string, unknown>
    const wordsResult = Array.isArray(source.words_result) ? source.words_result : []
    const dedupe = new Set<string>()
    const blocks: DetectedTextBlock[] = []

    for (const itemRaw of wordsResult) {
        if (!itemRaw || typeof itemRaw !== "object") continue
        const item = itemRaw as Record<string, unknown>
        const sourceText = String(item.words ?? item.text ?? "").trim()
        if (!sourceText) continue

        let minX: number | null = null
        let minY: number | null = null
        let maxX: number | null = null
        let maxY: number | null = null

        const location = item.location
        if (location && typeof location === "object") {
            const loc = location as Record<string, unknown>
            const left = toNumber(loc.left)
            const top = toNumber(loc.top)
            const width = toNumber(loc.width)
            const height = toNumber(loc.height)
            if (left !== null && top !== null && width !== null && height !== null && width > 0 && height > 0) {
                minX = left
                minY = top
                maxX = left + width
                maxY = top + height
            }
        }

        if (minX === null || minY === null || maxX === null || maxY === null) {
            const vertices = Array.isArray(item.vertexes_location) ? item.vertexes_location : []
            const points = vertices
                .map((vertex) => toPoint(vertex))
                .filter((point): point is { x: number; y: number } => Boolean(point))
            if (points.length >= 2) {
                minX = Math.min(...points.map((point) => point.x))
                maxX = Math.max(...points.map((point) => point.x))
                minY = Math.min(...points.map((point) => point.y))
                maxY = Math.max(...points.map((point) => point.y))
            }
        }

        if (minX === null || minY === null || maxX === null || maxY === null || maxX <= minX || maxY <= minY) {
            continue
        }

        const bbox = {
            x: normalizeCoordinate(minX, size.width),
            y: normalizeCoordinate(minY, size.height),
            width: normalizeLength(maxX - minX, size.width),
            height: normalizeLength(maxY - minY, size.height),
        }
        if (bbox.width <= 0 || bbox.height <= 0) continue

        const key = [
            sourceText,
            bbox.x.toFixed(4),
            bbox.y.toFixed(4),
            bbox.width.toFixed(4),
            bbox.height.toFixed(4),
        ].join("|")
        if (dedupe.has(key)) continue
        dedupe.add(key)

        blocks.push({
            sourceText,
            translatedText: sourceText,
            bbox,
        })
    }

    return blocks
}

async function detectWithBaiduOcr(
    config: BaiduOcrAdapterConfig,
    request: ExternalOcrRequest
): Promise<ExternalOcrResult> {
    const apiKey = config.apiKey.trim()
    const secretKey = config.secretKey.trim()
    if (!apiKey || !secretKey) {
        return {
            success: false,
            blocks: [],
            provider: "baidu-ocr",
            model: "baidu-general",
            error: "百度 OCR 未配置 API Key / Secret Key",
        }
    }

    const timeoutMs = Math.max(3_000, config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
        const accessToken = await getBaiduAccessToken(config)
        const endpoint = (config.endpoint || BAIDU_OCR_ENDPOINT).trim()
        const target = endpoint.includes("access_token=")
            ? endpoint
            : `${endpoint}${endpoint.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`

        const form = new URLSearchParams()
        form.set("image", stripDataUrlPrefix(request.imageData))
        form.set("detect_direction", "true")
        form.set("detect_language", "true")
        form.set("paragraph", "true")
        form.set("probability", "true")
        form.set("vertexes_location", "true")

        const response = await fetchWithTimeout(
            target,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: form.toString(),
            },
            timeoutMs
        )
        const parsed = await parseUnknownResponse(response) as Record<string, unknown> | null

        if (!response.ok) {
            const message = parsed && typeof parsed.error_msg === "string"
                ? parsed.error_msg
                : `HTTP ${response.status}`
            return {
                success: false,
                blocks: [],
                provider: "baidu-ocr",
                model: "baidu-general",
                error: `百度 OCR 请求失败: ${message}`,
            }
        }

        if (parsed && typeof parsed.error_code !== "undefined") {
            const message = typeof parsed.error_msg === "string" ? parsed.error_msg : "Unknown error"
            return {
                success: false,
                blocks: [],
                provider: "baidu-ocr",
                model: "baidu-general",
                error: `百度 OCR 返回错误: ${message}`,
            }
        }

        const blocks = normalizeBaiduBlocks(parsed, {
            width: request.imageWidth,
            height: request.imageHeight,
        })
        if (!blocks.length) {
            return {
                success: false,
                blocks: [],
                provider: "baidu-ocr",
                model: "baidu-general",
                error: "百度 OCR 未识别到可用文本块",
            }
        }

        return {
            success: true,
            blocks,
            provider: "baidu-ocr",
            model: "baidu-general",
        }
    } catch (error) {
        return {
            success: false,
            blocks: [],
            provider: "baidu-ocr",
            model: "baidu-general",
            error: error instanceof Error ? error.message : "百度 OCR 调用失败",
        }
    }
}

async function detectWithMangaOcr(
    config: HttpOcrAdapterConfig,
    request: ExternalOcrRequest
): Promise<ExternalOcrResult> {
    return runHttpOcrEngine(config, request, {
        provider: "manga-ocr",
        model: "manga-ocr",
        endpoints: ["/detect", "/api/detect", "/ocr", "/api/ocr", "/predict", "/api/predict"],
        buildPayloads: (rawBase64, targetLanguage) => ([
            { image: rawBase64, target_language: targetLanguage },
            { imageData: rawBase64, target_language: targetLanguage },
            { image_base64: rawBase64, target_language: targetLanguage },
            { img: rawBase64, lang: targetLanguage },
        ]),
        normalize: normalizeGenericBlocks,
    })
}

async function detectWithPaddleOcr(
    config: HttpOcrAdapterConfig,
    request: ExternalOcrRequest
): Promise<ExternalOcrResult> {
    return runHttpOcrEngine(config, request, {
        provider: "paddle-ocr",
        model: "paddle-ocr",
        endpoints: ["/ocr", "/api/ocr", "/predict", "/api/predict", "/detect", "/api/detect"],
        buildPayloads: (rawBase64, targetLanguage) => ([
            { image: rawBase64, lang: targetLanguage, det: true, rec: true, cls: true },
            { imageData: rawBase64, lang: targetLanguage, use_det: true, use_rec: true, use_cls: true },
            { image_base64: rawBase64, language: targetLanguage },
        ]),
        normalize: normalizePaddleBlocks,
    })
}

export async function detectTextWithExternalOcr(
    engine: ExternalOcrEngine,
    config: HttpOcrAdapterConfig | BaiduOcrAdapterConfig,
    request: ExternalOcrRequest
): Promise<ExternalOcrResult> {
    if (engine === "manga_ocr") {
        return detectWithMangaOcr(config as HttpOcrAdapterConfig, request)
    }
    if (engine === "paddle_ocr") {
        return detectWithPaddleOcr(config as HttpOcrAdapterConfig, request)
    }
    return detectWithBaiduOcr(config as BaiduOcrAdapterConfig, request)
}


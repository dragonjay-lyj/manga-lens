export type LamaInpaintConfig = {
    baseUrl: string
    apiKey?: string
    timeoutMs?: number
}

export type LamaInpaintRequest = {
    imageData: string
    maskData: string
}

export type LamaInpaintResponse = {
    success: boolean
    imageData?: string
    provider: string
    model: string
    error?: string
}

const DEFAULT_TIMEOUT_MS = 45_000

function stripDataUrlPrefix(dataUrl: string): string {
    return dataUrl.replace(/^data:image\/\w+;base64,/, "")
}

function ensureImageDataUrl(value: string): string {
    if (value.startsWith("data:image/")) return value
    return `data:image/png;base64,${value}`
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
    if (contentType.startsWith("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer())
        const mimeType = contentType.split(";")[0] || "image/png"
        return `data:${mimeType};base64,${buffer.toString("base64")}`
    }
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

function extractImageData(payload: unknown): string | null {
    if (!payload) return null
    if (typeof payload === "string") {
        const trimmed = payload.trim()
        if (!trimmed) return null
        return ensureImageDataUrl(trimmed)
    }
    if (Array.isArray(payload)) {
        for (const item of payload) {
            const candidate = extractImageData(item)
            if (candidate) return candidate
        }
        return null
    }
    if (typeof payload !== "object") return null

    const source = payload as Record<string, unknown>
    const candidates = [
        source.imageData,
        source.image_data,
        source.image,
        source.result,
        source.output,
        source.inpainted,
        source.data,
    ]

    for (const candidate of candidates) {
        const resolved = extractImageData(candidate)
        if (resolved) return resolved
    }

    return null
}

export async function runLamaInpaint(
    config: LamaInpaintConfig,
    request: LamaInpaintRequest
): Promise<LamaInpaintResponse> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "")
    if (!baseUrl) {
        return {
            success: false,
            provider: "lama-inpaint",
            model: "lama",
            error: "LAMA 修复服务未配置地址",
        }
    }

    const timeoutMs = Math.max(5_000, config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const imageBase64 = stripDataUrlPrefix(request.imageData)
    const maskBase64 = stripDataUrlPrefix(request.maskData)
    const authHeaders: Record<string, string> = {}
    if (config.apiKey) {
        authHeaders.Authorization = `Bearer ${config.apiKey}`
        authHeaders["X-API-Key"] = config.apiKey
    }

    const endpoints = ["/inpaint", "/api/inpaint", "/predict", "/api/predict"]
    const payloads = [
        { image: imageBase64, mask: maskBase64 },
        { imageData: imageBase64, maskData: maskBase64 },
        { image_base64: imageBase64, mask_base64: maskBase64 },
    ]
    const errors: string[] = []

    for (const endpoint of endpoints) {
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
                    const text = await response.text().catch(() => "")
                    errors.push(`${endpoint} ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`)
                    continue
                }

                const parsed = await parseUnknownResponse(response)
                const imageData = extractImageData(parsed)
                if (imageData) {
                    return {
                        success: true,
                        imageData,
                        provider: "lama-inpaint",
                        model: "lama",
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
        provider: "lama-inpaint",
        model: "lama",
        error: errors.length ? `LAMA 调用失败: ${errors[0]}` : "LAMA 未返回可用图像",
    }
}


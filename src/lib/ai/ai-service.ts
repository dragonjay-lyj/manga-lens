// AI 服务 - 封装 Gemini 和 OpenAI 兼容接口

import type { AIProvider } from '@/types/database'

export interface AIConfig {
    provider: AIProvider
    apiKey: string
    baseUrl?: string
    model?: string
}

export interface GenerateImageRequest {
    imageData: string // base64 图片数据
    prompt: string
    config: AIConfig
}

export interface GenerateImageResponse {
    success: boolean
    imageData?: string // base64 结果图片
    error?: string
}

export interface TextBlockBBox {
    x: number // 0-1 normalized
    y: number // 0-1 normalized
    width: number // 0-1 normalized
    height: number // 0-1 normalized
}

export interface DetectedTextBlock {
    sourceText: string
    translatedText: string
    bbox: TextBlockBBox
}

export interface DetectTextRequest {
    imageData: string // base64 图片数据
    config: AIConfig
    targetLanguage?: string
}

export interface DetectTextResponse {
    success: boolean
    blocks: DetectedTextBlock[]
    error?: string
    raw?: string
}

const REQUEST_TIMEOUT_MS = 90_000

// Gemini 模型列表
export const GEMINI_MODELS = [
    { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (推荐)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (文本优先)' },
]

// OpenAI 模型列表
export const OPENAI_MODELS = [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
]

const TRANSLATION_KEYWORDS =
    /(翻译|日文|日语|日语|日本語|中文|简体|繁体|英译|中译|对话|台词|气泡|字幕|translate|translation|japanese|chinese|subtitle|dialogue|speech)/i

const VERTICAL_LAYOUT_KEYWORDS = /(竖排|縦書き|vertical)/i

/**
 * 对漫画局部重绘请求追加稳定约束，降低“竖排错乱/覆盖周边”概率。
 */
export function buildMangaEditPrompt(userPrompt: string): string {
    const rawPrompt = userPrompt.trim()
    const isLikelyTranslation = rawPrompt.length === 0 || TRANSLATION_KEYWORDS.test(rawPrompt)

    if (!isLikelyTranslation) {
        return [
            'You are editing a selected patch from a manga image.',
            'Strict rules:',
            '1) Edit only text/content relevant to the user request.',
            '2) Keep style, lines, background, and composition unchanged.',
            '3) Output image only. No extra borders. Same visual framing.',
            `User request: ${rawPrompt}`,
        ].join('\n')
    }

    const task = rawPrompt || '请将图片中的日文对话翻译替换为自然、通顺的简体中文。'
    const layoutRule = VERTICAL_LAYOUT_KEYWORDS.test(rawPrompt)
        ? '文字排版要求：使用竖排（从上到下，从右到左列），并保持标点位置自然。'
        : '文字排版要求：默认使用横排中文（从左到右、从上到下），不要竖排。'

    return [
        '你是漫画局部翻译修图引擎，只输出编辑后的图片。',
        '硬性要求：',
        '1) 只替换原有文字，人物、线条、网点、气泡形状和背景必须保持不变。',
        '2) 输出必须与输入区域视觉一致，不要额外边框、不要裁切、不要改变构图。',
        '3) 先清除原文再排版，避免重影、乱码、错位和符号拆分（例如 “（）” 分离）。',
        '4) 将原文翻译为简体中文。',
        `5) ${layoutRule}`,
        '6) 字体风格必须贴近原文：保持原有字重、笔画粗细、描边/阴影、间距、大小与排版密度；避免使用通用默认字体感。',
        '7) 文本应继续落在原气泡可读区域内，行数与对齐尽量接近原文，避免明显溢出或留白异常。',
        '8) 翻译要贴合语境、口语自然，可适度意译但不能改变剧情信息。',
        '9) 仅返回图片，不要返回说明文本。',
        `用户要求：${task}`,
    ].join('\n')
}

function truncate(text: string, maxLen = 320): string {
    if (text.length <= maxLen) return text
    return `${text.slice(0, maxLen)}...`
}

function clampNormalized(value: number): number {
    if (!Number.isFinite(value)) return 0
    if (value > 1 && value <= 100) return Math.min(1, Math.max(0, value / 100))
    return Math.min(1, Math.max(0, value))
}

function parseJsonFromText(raw: string): unknown {
    const trimmed = raw.trim()
    if (!trimmed) return null

    try {
        return JSON.parse(trimmed)
    } catch {
        // 尝试提取 markdown code block
    }

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (codeBlockMatch?.[1]) {
        try {
            return JSON.parse(codeBlockMatch[1].trim())
        } catch {
            // ignore
        }
    }

    // 尝试提取第一个 JSON 对象/数组
    const objectStart = trimmed.indexOf('{')
    const objectEnd = trimmed.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
        const jsonText = trimmed.slice(objectStart, objectEnd + 1)
        try {
            return JSON.parse(jsonText)
        } catch {
            // ignore
        }
    }

    const arrayStart = trimmed.indexOf('[')
    const arrayEnd = trimmed.lastIndexOf(']')
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        const jsonText = trimmed.slice(arrayStart, arrayEnd + 1)
        try {
            return JSON.parse(jsonText)
        } catch {
            // ignore
        }
    }

    return null
}

function toNumber(input: unknown): number | null {
    if (typeof input === 'number' && Number.isFinite(input)) return input
    if (typeof input === 'string' && input.trim()) {
        const parsed = Number(input)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

function normalizeDetectedBlocks(payload: unknown): DetectedTextBlock[] {
    const root = payload as Record<string, unknown> | unknown[] | null
    if (!root) return []

    const rawBlocks = Array.isArray(root)
        ? root
        : Array.isArray((root as Record<string, unknown>).blocks)
            ? ((root as Record<string, unknown>).blocks as unknown[])
            : []

    const normalized: DetectedTextBlock[] = []

    for (const rawBlock of rawBlocks) {
        if (!rawBlock || typeof rawBlock !== 'object') continue
        const block = rawBlock as Record<string, unknown>

        const sourceText = String(
            block.sourceText ??
            block.source_text ??
            block.text ??
            block.original ??
            ''
        ).trim()
        const translatedText = String(
            block.translatedText ??
            block.translated_text ??
            block.translation ??
            block.cn ??
            block.zh ??
            ''
        ).trim()

        const bboxRaw = (block.bbox ?? block.box ?? block.position) as Record<string, unknown> | undefined
        if (!bboxRaw) continue

        const left = toNumber(bboxRaw.x ?? bboxRaw.left)
        const top = toNumber(bboxRaw.y ?? bboxRaw.top)
        const widthFromSize = toNumber(bboxRaw.width ?? bboxRaw.w)
        const heightFromSize = toNumber(bboxRaw.height ?? bboxRaw.h)
        const right = toNumber(bboxRaw.right ?? bboxRaw.x2)
        const bottom = toNumber(bboxRaw.bottom ?? bboxRaw.y2)

        const width = widthFromSize ?? (left !== null && right !== null ? right - left : null)
        const height = heightFromSize ?? (top !== null && bottom !== null ? bottom - top : null)

        if (left === null || top === null || width === null || height === null) continue
        if (width <= 0 || height <= 0) continue

        normalized.push({
            sourceText,
            translatedText,
            bbox: {
                x: clampNormalized(left),
                y: clampNormalized(top),
                width: clampNormalized(width),
                height: clampNormalized(height),
            },
        })
    }

    return normalized
}

async function readApiError(response: Response): Promise<string> {
    const raw = await response.text()
    if (!raw) {
        return `HTTP ${response.status}`
    }

    try {
        const data = JSON.parse(raw)
        const msg = data?.error?.message || data?.message || raw
        return truncate(String(msg))
    } catch {
        return truncate(raw)
    }
}

function getInlineData(part: unknown): { data?: string } | undefined {
    if (!part || typeof part !== 'object') return undefined
    const p = part as Record<string, unknown>
    const snake = p.inline_data as { data?: string } | undefined
    if (snake?.data) return snake
    const camel = p.inlineData as { data?: string } | undefined
    if (camel?.data) return camel
    return undefined
}

async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        })
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(`请求超时（>${Math.floor(timeoutMs / 1000)}s）`)
        }
        throw error
    } finally {
        clearTimeout(timeoutId)
    }
}

// 使用 Gemini API 生成图片
async function generateWithGemini(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    const { imageData, prompt, config } = request
    const model = config.model || 'gemini-2.5-flash-image'

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`

    try {
        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                inline_data: {
                                    mime_type: 'image/png',
                                    data: imageData.replace(/^data:image\/\w+;base64,/, ''),
                                },
                            },
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                },
            }),
        })

        if (!response.ok) {
            const apiError = await readApiError(response)
            if (response.status === 404) {
                throw new Error(
                    `Gemini 模型不可用(${model})。请改用 gemini-2.5-flash-image，或在 AI Studio 检查该模型是否对你的账号开放。详情: ${apiError}`
                )
            }
            throw new Error(`Gemini API ${response.status}: ${apiError}`)
        }

        const data = await response.json()

        // 从响应中提取图片
        const parts = data.candidates?.[0]?.content?.parts || []
        const imagePart = parts.find((part: unknown) => getInlineData(part)?.data)

        const inlineData = getInlineData(imagePart)
        if (inlineData?.data) {
            return {
                success: true,
                imageData: `data:image/png;base64,${inlineData.data}`,
            }
        }

        // 如果没有图片，检查是否有文本响应
        const textPart = parts.find((part: { text?: string }) => part.text)
        if (textPart?.text) {
            return {
                success: false,
                error: `AI 返回文本而非图片（模型可能不支持图像输出，model=${model}）: ${truncate(textPart.text, 220)}`,
            }
        }

        const finishReason = data.candidates?.[0]?.finishReason || data.candidates?.[0]?.finish_reason
        return {
            success: false,
            error: `未能从 AI 响应中提取图片（model=${model}, finishReason=${finishReason || 'unknown'}）`,
        }
    } catch (error) {
        console.error('Gemini generate failed:', {
            model,
            provider: config.provider,
            error,
        })
        return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误',
        }
    }
}

// 使用 OpenAI 兼容接口生成图片
async function generateWithOpenAI(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    const { imageData, prompt, config } = request
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    const model = config.model || 'gpt-4o'

    try {
        const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageData,
                                },
                            },
                            {
                                type: 'text',
                                text: prompt,
                            },
                        ],
                    },
                ],
                max_tokens: 4096,
            }),
        })

        if (!response.ok) {
            const apiError = await readApiError(response)
            throw new Error(`OpenAI API ${response.status}: ${apiError}`)
        }

        const data = await response.json()
        const rawContent = data.choices?.[0]?.message?.content
        const content = Array.isArray(rawContent)
            ? rawContent.map((item: { text?: string }) => item?.text || '').join('\n')
            : rawContent

        // OpenAI 通常不直接返回图片，这里需要特殊处理
        // 如果使用的是支持图像生成的兼容接口，需要解析响应
        if (typeof content === 'string' && content) {
            // 检查是否是 base64 图片
            if (content.startsWith('data:image')) {
                return {
                    success: true,
                    imageData: content,
                }
            }

            // 尝试从 JSON 响应中提取图片
            try {
                const parsed = JSON.parse(content)
                if (parsed.image) {
                    return {
                        success: true,
                        imageData: parsed.image,
                    }
                }
            } catch {
                // 不是 JSON，继续
            }

            return {
                success: false,
                error: `OpenAI 返回文本响应（该模型/接口可能不支持图像生成）: ${truncate(content, 220)}`,
            }
        }

        return {
            success: false,
            error: '未能从 OpenAI 响应中提取结果',
        }
    } catch (error) {
        console.error('OpenAI generate failed:', {
            model,
            provider: config.provider,
            error,
        })
        return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误',
        }
    }
}

function buildDetectionPrompt(targetLanguage: string): string {
    return [
        `请检测图片中的所有文本块，并翻译为${targetLanguage}。`,
        '输出必须是 JSON，格式如下：',
        '{"blocks":[{"sourceText":"原文","translatedText":"译文","bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.15}}]}',
        '要求：',
        '1) bbox 使用 0-1 归一化坐标（相对整张图），x/y 为左上角。',
        '2) 只输出 JSON，不要输出 markdown 或解释。',
        '3) translatedText 使用自然、口语化译文。',
    ].join('\n')
}

async function detectWithGemini(request: DetectTextRequest): Promise<DetectTextResponse> {
    const { imageData, config } = request
    const targetLanguage = request.targetLanguage || '简体中文'
    const model = 'gemini-2.5-flash'
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`
    const prompt = buildDetectionPrompt(targetLanguage)

    try {
        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                inline_data: {
                                    mime_type: 'image/png',
                                    data: imageData.replace(/^data:image\/\w+;base64,/, ''),
                                },
                            },
                            { text: prompt },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                },
            }),
        })

        if (!response.ok) {
            const apiError = await readApiError(response)
            return {
                success: false,
                blocks: [],
                error: `Gemini OCR API ${response.status}: ${apiError}`,
            }
        }

        const data = await response.json()
        const parts = data.candidates?.[0]?.content?.parts || []
        const textPart = parts.find((part: { text?: string }) => typeof part?.text === 'string')
        const rawText = textPart?.text || ''
        const parsed = parseJsonFromText(rawText)
        const blocks = normalizeDetectedBlocks(parsed)

        return {
            success: true,
            blocks,
            raw: rawText,
        }
    } catch (error) {
        return {
            success: false,
            blocks: [],
            error: error instanceof Error ? error.message : '未知错误',
        }
    }
}

async function detectWithOpenAI(request: DetectTextRequest): Promise<DetectTextResponse> {
    const { imageData, config } = request
    const targetLanguage = request.targetLanguage || '简体中文'
    const model = config.model || 'gpt-4o'
    const prompt = buildDetectionPrompt(targetLanguage)
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1'

    try {
        const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: { url: imageData },
                            },
                            {
                                type: 'text',
                                text: prompt,
                            },
                        ],
                    },
                ],
                temperature: 0.1,
                max_tokens: 2048,
            }),
        })

        if (!response.ok) {
            const apiError = await readApiError(response)
            return {
                success: false,
                blocks: [],
                error: `OpenAI OCR API ${response.status}: ${apiError}`,
            }
        }

        const data = await response.json()
        const rawContent = data.choices?.[0]?.message?.content
        const rawText = Array.isArray(rawContent)
            ? rawContent.map((item: { text?: string }) => item?.text || '').join('\n')
            : String(rawContent || '')
        const parsed = parseJsonFromText(rawText)
        const blocks = normalizeDetectedBlocks(parsed)

        return {
            success: true,
            blocks,
            raw: rawText,
        }
    } catch (error) {
        return {
            success: false,
            blocks: [],
            error: error instanceof Error ? error.message : '未知错误',
        }
    }
}

export async function detectTextBlocks(request: DetectTextRequest): Promise<DetectTextResponse> {
    const { config } = request
    if (!config.apiKey) {
        return {
            success: false,
            blocks: [],
            error: '请先配置 API Key',
        }
    }

    if (config.provider === 'gemini') {
        return detectWithGemini(request)
    }

    return detectWithOpenAI(request)
}

// 统一的图片生成接口
export async function generateImage(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    const { config } = request

    if (!config.apiKey) {
        return {
            success: false,
            error: '请先配置 API Key',
        }
    }

    if (config.provider === 'gemini') {
        return generateWithGemini(request)
    } else {
        return generateWithOpenAI(request)
    }
}

// 批量处理图片
export interface BatchProcessOptions {
    onProgress?: (completed: number, total: number, current: string) => void
    onItemStart?: (current: string, completed: number, total: number) => void
    onError?: (imageId: string, error: string) => void
    concurrency?: number
    isSerial?: boolean
    maxRetries?: number // 最大重试次数
}

// 带重试的生成函数
async function generateWithRetry(
    request: GenerateImageRequest,
    maxRetries: number = 2
): Promise<GenerateImageResponse> {
    let lastError: string = ''
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await generateImage(request)
        if (result.success) {
            return result
        }
        lastError = result.error || '未知错误'
        // 如果是速率限制错误，等待后重试
        if (lastError.includes('rate') || lastError.includes('limit') || lastError.includes('429')) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        } else if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }
    return { success: false, error: lastError }
}

export async function batchGenerateImages(
    requests: Array<{ imageId: string; request: GenerateImageRequest }>,
    options: BatchProcessOptions = {}
): Promise<Map<string, GenerateImageResponse>> {
    const { onProgress, onItemStart, onError, concurrency = 3, isSerial = false, maxRetries = 2 } = options
    const results = new Map<string, GenerateImageResponse>()
    const total = requests.length
    let completed = 0

    if (isSerial) {
        // 串行处理
        for (const { imageId, request } of requests) {
            onItemStart?.(imageId, completed, total)
            const result = await generateWithRetry(request, maxRetries)
            results.set(imageId, result)
            completed++
            onProgress?.(completed, total, imageId)
            if (!result.success) {
                onError?.(imageId, result.error || '未知错误')
            }
        }
    } else {
        // 并发处理 - 使用 Promise 池实现真正的并发控制
        const pending: Promise<void>[] = []
        const queue = [...requests]

        const processNext = async (): Promise<void> => {
            while (queue.length > 0) {
                const item = queue.shift()
                if (!item) break

                const { imageId, request } = item
                onItemStart?.(imageId, completed, total)
                const result = await generateWithRetry(request, maxRetries)
                results.set(imageId, result)
                completed++
                onProgress?.(completed, total, imageId)
                if (!result.success) {
                    onError?.(imageId, result.error || '未知错误')
                }
            }
        }

        // 启动并发工作者
        for (let i = 0; i < Math.min(concurrency, requests.length); i++) {
            pending.push(processNext())
        }

        await Promise.all(pending)
    }

    return results
}

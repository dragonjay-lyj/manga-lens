// AI 服务 - 封装 Gemini 和 OpenAI 兼容接口

import type { AIProvider } from '@/types/database'

export type ImageSizeOption = '1K' | '2K' | '4K'

export interface AIConfig {
    provider: AIProvider
    apiKey: string
    baseUrl?: string
    model?: string
    imageSize?: ImageSizeOption
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

export interface TextLayoutStyleHints {
    textColor?: string
    outlineColor?: string
    strokeColor?: string
    strokeWidth?: number
    textOpacity?: number
    fontFamily?: string
    angle?: number
    orientation?: "vertical" | "horizontal" | "auto"
    alignment?: "start" | "center" | "end" | "justify" | "auto"
    fontWeight?: string
}

export interface TextSegmentBBox {
    x: number
    y: number
    width: number
    height: number
}

export interface DetectedTextBlock {
    sourceText: string
    translatedText: string
    bbox: TextBlockBBox
    sourceLanguage?: string
    lines?: string[]
    segments?: TextSegmentBBox[]
    style?: TextLayoutStyleHints
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
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview (4K 支持)' },
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
const HORIZONTAL_LAYOUT_KEYWORDS = /(横排|horizontal)/i

export type TranslationDirection = "ja2zh" | "en2zh" | "ja2en" | "en2ja"

export function getTranslationDirectionMeta(direction: TranslationDirection) {
    if (direction === "en2zh") {
        return {
            sourceLangLabel: "英语",
            targetLangLabel: "简体中文",
            sourceLangCode: "en",
            targetLangCode: "zh",
        }
    }
    if (direction === "ja2en") {
        return {
            sourceLangLabel: "日语",
            targetLangLabel: "英语",
            sourceLangCode: "ja",
            targetLangCode: "en",
        }
    }
    if (direction === "en2ja") {
        return {
            sourceLangLabel: "英语",
            targetLangLabel: "日语",
            sourceLangCode: "en",
            targetLangCode: "ja",
        }
    }
    return {
        sourceLangLabel: "日语",
        targetLangLabel: "简体中文",
        sourceLangCode: "ja",
        targetLangCode: "zh",
    }
}

/**
 * 对漫画局部重绘请求追加稳定约束，降低“竖排错乱/覆盖周边”概率。
 */
export function buildMangaEditPrompt(
    userPrompt: string,
    options?: {
        direction?: TranslationDirection
        comicType?: "auto" | "manga" | "western"
        textStylePreset?: "match-original" | "comic-bold" | "clean-serif"
    }
): string {
    const rawPrompt = userPrompt.trim()
    const isLikelyTranslation = rawPrompt.length === 0 || TRANSLATION_KEYWORDS.test(rawPrompt)
    const direction = options?.direction ?? "ja2zh"
    const comicType = options?.comicType ?? "auto"
    const textStylePreset = options?.textStylePreset ?? "match-original"
    const directionMeta = getTranslationDirectionMeta(direction)

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

    const defaultTaskByDirection: Record<TranslationDirection, string> = {
        ja2zh: "请将图片中的日文文本翻译并替换为自然、通顺的简体中文。",
        en2zh: "请将图片中的英文文本翻译并替换为自然、通顺的简体中文。",
        ja2en: "Please translate Japanese text in the image to natural English and replace it in place.",
        en2ja: "画像内の英語テキストを自然な日本語に翻訳し、元位置に置き換えてください。",
    }
    const effectiveTask = rawPrompt || defaultTaskByDirection[direction]
    const layoutRule = VERTICAL_LAYOUT_KEYWORDS.test(rawPrompt)
        ? '文字排版要求：使用竖排（从上到下，从右到左列），并保持标点位置自然。'
        : HORIZONTAL_LAYOUT_KEYWORDS.test(rawPrompt)
            ? '文字排版要求：使用横排中文（从左到右、从上到下）。'
            : '文字排版要求：优先保持原文排版方向与行列结构（原文竖排就竖排，原文横排就横排）。'
    const comicRule = comicType === "manga"
        ? "页面类型：日漫/黑白网点风格。优先保持竖排阅读习惯与字距密度。"
        : comicType === "western"
            ? "页面类型：美漫/西文阅读习惯。优先保持横排、大小写与对齐节奏。"
            : "页面类型：自动判断（日漫/美漫皆可），优先保持原有阅读方向。"
    const stylePresetRule = textStylePreset === "comic-bold"
        ? "字体预设：漫画粗体。保持强对比、黑体感和稳定描边。"
        : textStylePreset === "clean-serif"
            ? "字体预设：清晰衬线体。保证可读性，适合长文本和条漫。"
            : "字体预设：尽量匹配原文（字重/轮廓/倾斜/颜色）。"

    return [
        '你是漫画局部翻译修图引擎，只输出编辑后的图片。',
        '硬性要求：',
        '1) 只替换原有文字，人物、线条、网点、气泡形状和背景必须保持不变。',
        '2) 输出必须与输入区域视觉一致，不要额外边框、不要裁切、不要改变构图。',
        '3) 先清除原文再排版，避免重影、乱码、错位和符号拆分（例如 “（）” 分离）。',
        `4) 将原文从${directionMeta.sourceLangLabel}翻译为${directionMeta.targetLangLabel}。`,
        `5) ${layoutRule}`,
        `6) ${comicRule}`,
        `7) ${stylePresetRule}`,
        '8) 字体风格必须贴近原文：保持原有字重、笔画粗细、描边/阴影、间距、大小与排版密度；避免使用通用默认字体感。',
        '9) 文本应继续落在原气泡可读区域内，行数与对齐尽量接近原文，避免明显溢出或留白异常。',
        '10) 翻译要贴合语境、口语自然，可适度意译但不能改变剧情信息。',
        '11) 严禁只擦除不重绘：最终图片中每个对白区域都必须有清晰可读的目标语言文本，不能留空白块。',
        '12) 若个别词无法识别，可用最接近语境的保守译法或音译占位，但绝不能留空。',
        '13) 仅返回图片，不要返回说明文本。',
        `用户要求：${effectiveTask}`,
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

function normalizeGeminiImageSize(input?: string): ImageSizeOption | undefined {
    const raw = (input || '').trim().toUpperCase()
    if (raw === '1K' || raw === '2K' || raw === '4K') {
        return raw
    }
    return undefined
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

        const sourceLanguage = String(
            block.sourceLanguage ??
            block.source_language ??
            block.lang ??
            ""
        ).trim() || undefined

        const normalizeSegment = (item: unknown): TextSegmentBBox | null => {
            if (!item || typeof item !== "object") return null
            const box = item as Record<string, unknown>
            const sx = toNumber(box.x ?? box.left)
            const sy = toNumber(box.y ?? box.top)
            const sw = toNumber(box.width ?? box.w)
            const sh = toNumber(box.height ?? box.h)
            if (sx === null || sy === null || sw === null || sh === null) return null
            if (sw <= 0 || sh <= 0) return null
            return {
                x: clampNormalized(sx),
                y: clampNormalized(sy),
                width: clampNormalized(sw),
                height: clampNormalized(sh),
            }
        }

        const lines = Array.isArray(block.lines)
            ? block.lines.map((line) => String(line ?? "").trim()).filter(Boolean)
            : Array.isArray(block.lineTexts)
                ? (block.lineTexts as unknown[]).map((line) => String(line ?? "").trim()).filter(Boolean)
                : undefined
        const segmentsRaw = Array.isArray(block.segments) ? block.segments : Array.isArray(block.segment_boxes) ? block.segment_boxes : []
        const segments = (segmentsRaw as unknown[]).map(normalizeSegment).filter((segment): segment is TextSegmentBBox => Boolean(segment))

        const styleRaw = (block.style ?? block.styleHints ?? block.layout) as Record<string, unknown> | undefined
        const style: TextLayoutStyleHints | undefined = styleRaw
            ? {
                textColor: typeof styleRaw.textColor === "string" ? styleRaw.textColor : (typeof styleRaw.color === "string" ? styleRaw.color : undefined),
                outlineColor: typeof styleRaw.outlineColor === "string" ? styleRaw.outlineColor : (typeof styleRaw.strokeColor === "string" ? styleRaw.strokeColor : undefined),
                strokeColor: typeof styleRaw.strokeColor === "string" ? styleRaw.strokeColor : (typeof styleRaw.outlineColor === "string" ? styleRaw.outlineColor : undefined),
                strokeWidth: toNumber(styleRaw.strokeWidth ?? styleRaw.stroke_width) ?? undefined,
                textOpacity: toNumber(styleRaw.textOpacity ?? styleRaw.opacity) ?? undefined,
                fontFamily: typeof styleRaw.fontFamily === "string" ? styleRaw.fontFamily : undefined,
                angle: toNumber(styleRaw.angle ?? styleRaw.rotation) ?? undefined,
                orientation: typeof styleRaw.orientation === "string" ? (styleRaw.orientation as TextLayoutStyleHints["orientation"]) : undefined,
                alignment: typeof styleRaw.alignment === "string" ? (styleRaw.alignment as TextLayoutStyleHints["alignment"]) : undefined,
                fontWeight: typeof styleRaw.fontWeight === "string" ? styleRaw.fontWeight : undefined,
            }
            : undefined

        normalized.push({
            sourceText,
            translatedText,
            bbox: {
                x: clampNormalized(left),
                y: clampNormalized(top),
                width: clampNormalized(width),
                height: clampNormalized(height),
            },
            sourceLanguage,
            lines: lines?.length ? lines : undefined,
            segments: segments.length ? segments : undefined,
            style,
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
    const imageSize = normalizeGeminiImageSize(config.imageSize)

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`
    const baseGenerationConfig: Record<string, unknown> = {
        responseModalities: ['TEXT', 'IMAGE'],
    }

    try {
        const sendRequest = async (enableImageSize: boolean) => {
            const generationConfig: Record<string, unknown> = { ...baseGenerationConfig }
            if (enableImageSize && imageSize) {
                generationConfig.imageConfig = { imageSize }
            }

            return fetchWithTimeout(apiUrl, {
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
                    generationConfig,
                }),
            })
        }

        let response = await sendRequest(Boolean(imageSize))
        if (!response.ok && imageSize && response.status === 400) {
            const apiError = await readApiError(response)
            const shouldRetryWithoutImageSize =
                /imageSize|imageConfig|Unknown name|Invalid JSON payload/i.test(apiError)
            if (shouldRetryWithoutImageSize) {
                response = await sendRequest(false)
            } else {
                throw new Error(`Gemini API ${response.status}: ${apiError}`)
            }
        }

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
            imageSize,
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
        '{"blocks":[{"sourceText":"原文","translatedText":"译文","sourceLanguage":"ja","bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.15},"lines":["..."],"segments":[{"x":0.1,"y":0.2,"width":0.3,"height":0.06}],"style":{"textColor":"#000000","outlineColor":"#ffffff","strokeColor":"#ffffff","strokeWidth":1,"textOpacity":1,"fontFamily":"Noto Sans CJK SC","angle":0,"orientation":"vertical","alignment":"center","fontWeight":"bold"}}]}',
        '要求：',
        '1) bbox 使用 0-1 归一化坐标（相对整张图），x/y 为左上角。',
        '2) lines 返回按阅读顺序拆分后的文本行；segments 返回更细粒度文本分割框（可选）。',
        '3) style 需估计颜色、轮廓、角度、朝向、对齐和字重（可选，但尽量提供）。',
        '4) 只输出 JSON，不要输出 markdown 或解释。',
        '5) translatedText 使用自然、口语化译文。',
    ].join('\n')
}

async function detectWithGemini(request: DetectTextRequest): Promise<DetectTextResponse> {
    const { imageData, config } = request
    const targetLanguage = request.targetLanguage || '简体中文'
    const requestedModel = (config.model || '').trim()
    const model =
        requestedModel &&
        requestedModel.startsWith('gemini-') &&
        !/image/i.test(requestedModel)
            ? requestedModel
            : 'gemini-2.5-flash'
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

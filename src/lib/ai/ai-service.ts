// AI 服务 - 封装 Gemini 和 OpenAI 兼容接口

import type { AIProvider } from '@/types/database'
import { sanitizeModelText } from '@/lib/utils/text-sanitizer'

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

export interface TextDetectionRegion {
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
    sourceLanguageHint?: string
    sourceLanguageAllowlist?: SourceLanguageCode[]
    includeRegions?: TextDetectionRegion[]
    excludeRegions?: TextDetectionRegion[]
}

export interface DetectTextResponse {
    success: boolean
    blocks: DetectedTextBlock[]
    error?: string
    raw?: string
}

export interface TranslateImageSentenceRequest {
    imageData: string
    config: AIConfig
    targetLanguage: string
    sourceLanguageHint?: string
    extraPrompt?: string
    stripReasoningContent?: boolean
}

export interface TranslateImageSentenceResponse {
    success: boolean
    translatedText?: string
    raw?: string
    error?: string
}

const REQUEST_TIMEOUT_MS = 90_000
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

function trimTrailingSlashes(url: string): string {
    return url.replace(/\/+$/, '')
}

function resolveOpenAIBaseUrl(config: AIConfig): string {
    const raw = String(config.baseUrl || '').trim()
    if (!raw) return DEFAULT_OPENAI_BASE_URL
    // Migrate old persisted Gemini/OpenAI mixed defaults gracefully.
    if (/generativelanguage\.googleapis\.com/i.test(raw)) {
        return DEFAULT_OPENAI_BASE_URL
    }
    return trimTrailingSlashes(raw)
}

function buildGeminiGenerateContentApiUrl(config: AIConfig, model: string): string {
    const rawBaseUrl = String(config.baseUrl || '').trim()
    const shouldFallbackToDefault =
        !rawBaseUrl || /(^https?:\/\/)?api\.openai\.com\/v1\/?$/i.test(rawBaseUrl)
    let endpoint = shouldFallbackToDefault ? DEFAULT_GEMINI_BASE_URL : trimTrailingSlashes(rawBaseUrl)

    // Gemini official generateContent path uses /v1beta. If user provides /v1,
    // normalize it to /v1beta to avoid 404/unsupported endpoint issues.
    endpoint = endpoint.replace(/\/v1(?=\/|$)/i, '/v1beta')

    // Already full endpoint (for relays that expect fixed model path).
    if (!/:generateContent(?:\?|$)/i.test(endpoint)) {
        if (/\/models\/?$/i.test(endpoint)) {
            endpoint = `${endpoint}/${model}:generateContent`
        } else if (/\/v\d+(?:beta\d*)?\/?$/i.test(endpoint)) {
            endpoint = `${endpoint}/models/${model}:generateContent`
        } else {
            endpoint = `${endpoint}/v1beta/models/${model}:generateContent`
        }
    }

    const separator = endpoint.includes('?') ? '&' : '?'
    return `${endpoint}${separator}key=${encodeURIComponent(config.apiKey)}`
}

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

export type SourceLanguageCode = "ja" | "en" | "th" | "es" | "ar" | "id" | "hi" | "fi"

export type TranslationDirection =
    | "ja2zh"
    | "en2zh"
    | "th2zh"
    | "es2zh"
    | "ar2zh"
    | "id2zh"
    | "hi2zh"
    | "fi2zh"
    | "ja2en"
    | "en2ja"
    | "th2en"
    | "es2en"
    | "ar2en"
    | "id2en"
    | "hi2en"
    | "fi2en"
    | "ja2id"
    | "en2id"
    | "th2id"
    | "es2id"
    | "ar2id"
    | "ja2hi"
    | "en2hi"
    | "en2ar"
    | "ja2ar"
    | "en2fi"
    | "ja2fi"

export const TRANSLATION_DIRECTIONS: TranslationDirection[] = [
    "ja2zh",
    "en2zh",
    "th2zh",
    "es2zh",
    "ar2zh",
    "id2zh",
    "hi2zh",
    "fi2zh",
    "ja2en",
    "en2ja",
    "th2en",
    "es2en",
    "ar2en",
    "id2en",
    "hi2en",
    "fi2en",
    "ja2id",
    "en2id",
    "th2id",
    "es2id",
    "ar2id",
    "ja2hi",
    "en2hi",
    "en2ar",
    "ja2ar",
    "en2fi",
    "ja2fi",
]

const SOURCE_LANGUAGE_LABELS: Record<SourceLanguageCode, string> = {
    ja: "日语",
    en: "英语",
    th: "泰语",
    es: "西班牙语",
    ar: "阿拉伯语",
    id: "印尼语",
    hi: "印地语",
    fi: "芬兰语",
}

export function getSourceLanguageLabel(code: SourceLanguageCode): string {
    return SOURCE_LANGUAGE_LABELS[code]
}

export function getTranslationDirectionMeta(direction: TranslationDirection) {
    if (direction === "th2zh") {
        return {
            sourceLangLabel: "泰语",
            targetLangLabel: "简体中文",
            sourceLangCode: "th",
            targetLangCode: "zh",
        }
    }
    if (direction === "es2zh") {
        return {
            sourceLangLabel: "西班牙语",
            targetLangLabel: "简体中文",
            sourceLangCode: "es",
            targetLangCode: "zh",
        }
    }
    if (direction === "ar2zh") {
        return {
            sourceLangLabel: "阿拉伯语",
            targetLangLabel: "简体中文",
            sourceLangCode: "ar",
            targetLangCode: "zh",
        }
    }
    if (direction === "id2zh") {
        return {
            sourceLangLabel: "印尼语",
            targetLangLabel: "简体中文",
            sourceLangCode: "id",
            targetLangCode: "zh",
        }
    }
    if (direction === "hi2zh") {
        return {
            sourceLangLabel: "印地语",
            targetLangLabel: "简体中文",
            sourceLangCode: "hi",
            targetLangCode: "zh",
        }
    }
    if (direction === "fi2zh") {
        return {
            sourceLangLabel: "芬兰语",
            targetLangLabel: "简体中文",
            sourceLangCode: "fi",
            targetLangCode: "zh",
        }
    }
    if (direction === "en2zh") {
        return {
            sourceLangLabel: "英语",
            targetLangLabel: "简体中文",
            sourceLangCode: "en",
            targetLangCode: "zh",
        }
    }
    if (direction === "th2en") {
        return {
            sourceLangLabel: "泰语",
            targetLangLabel: "英语",
            sourceLangCode: "th",
            targetLangCode: "en",
        }
    }
    if (direction === "es2en") {
        return {
            sourceLangLabel: "西班牙语",
            targetLangLabel: "英语",
            sourceLangCode: "es",
            targetLangCode: "en",
        }
    }
    if (direction === "ar2en") {
        return {
            sourceLangLabel: "阿拉伯语",
            targetLangLabel: "英语",
            sourceLangCode: "ar",
            targetLangCode: "en",
        }
    }
    if (direction === "id2en") {
        return {
            sourceLangLabel: "印尼语",
            targetLangLabel: "英语",
            sourceLangCode: "id",
            targetLangCode: "en",
        }
    }
    if (direction === "hi2en") {
        return {
            sourceLangLabel: "印地语",
            targetLangLabel: "英语",
            sourceLangCode: "hi",
            targetLangCode: "en",
        }
    }
    if (direction === "fi2en") {
        return {
            sourceLangLabel: "芬兰语",
            targetLangLabel: "英语",
            sourceLangCode: "fi",
            targetLangCode: "en",
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
    if (direction === "en2ar") {
        return {
            sourceLangLabel: "英语",
            targetLangLabel: "阿拉伯语",
            sourceLangCode: "en",
            targetLangCode: "ar",
        }
    }
    if (direction === "en2fi") {
        return {
            sourceLangLabel: "英语",
            targetLangLabel: "芬兰语",
            sourceLangCode: "en",
            targetLangCode: "fi",
        }
    }
    if (direction === "ja2id") {
        return {
            sourceLangLabel: "日语",
            targetLangLabel: "印尼语",
            sourceLangCode: "ja",
            targetLangCode: "id",
        }
    }
    if (direction === "en2id") {
        return {
            sourceLangLabel: "英语",
            targetLangLabel: "印尼语",
            sourceLangCode: "en",
            targetLangCode: "id",
        }
    }
    if (direction === "th2id") {
        return {
            sourceLangLabel: "泰语",
            targetLangLabel: "印尼语",
            sourceLangCode: "th",
            targetLangCode: "id",
        }
    }
    if (direction === "es2id") {
        return {
            sourceLangLabel: "西班牙语",
            targetLangLabel: "印尼语",
            sourceLangCode: "es",
            targetLangCode: "id",
        }
    }
    if (direction === "ar2id") {
        return {
            sourceLangLabel: "阿拉伯语",
            targetLangLabel: "印尼语",
            sourceLangCode: "ar",
            targetLangCode: "id",
        }
    }
    if (direction === "ja2hi") {
        return {
            sourceLangLabel: "日语",
            targetLangLabel: "印地语",
            sourceLangCode: "ja",
            targetLangCode: "hi",
        }
    }
    if (direction === "en2hi") {
        return {
            sourceLangLabel: "英语",
            targetLangLabel: "印地语",
            sourceLangCode: "en",
            targetLangCode: "hi",
        }
    }
    if (direction === "ja2ar") {
        return {
            sourceLangLabel: "日语",
            targetLangLabel: "阿拉伯语",
            sourceLangCode: "ja",
            targetLangCode: "ar",
        }
    }
    if (direction === "ja2fi") {
        return {
            sourceLangLabel: "日语",
            targetLangLabel: "芬兰语",
            sourceLangCode: "ja",
            targetLangCode: "fi",
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
        sourceLanguageAllowlist?: SourceLanguageCode[]
        comicType?: "auto" | "manga" | "western"
        textStylePreset?: "match-original" | "comic-bold" | "clean-serif"
        preferredFontFamily?: string
    }
): string {
    const rawPrompt = userPrompt.trim()
    const isLikelyTranslation = rawPrompt.length === 0 || TRANSLATION_KEYWORDS.test(rawPrompt)
    const direction = options?.direction ?? "ja2zh"
    const sourceLanguageAllowlist = normalizeSourceLanguageAllowlist(options?.sourceLanguageAllowlist)
    const comicType = options?.comicType ?? "auto"
    const textStylePreset = options?.textStylePreset ?? "match-original"
    const preferredFontFamily = options?.preferredFontFamily?.trim()
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
        th2zh: "请将图片中的泰文文本翻译并替换为自然、通顺的简体中文。",
        es2zh: "请将图片中的西班牙文文本翻译并替换为自然、通顺的简体中文。",
        ar2zh: "请将图片中的阿拉伯文文本翻译并替换为自然、通顺的简体中文。",
        id2zh: "请将图片中的印尼文文本翻译并替换为自然、通顺的简体中文。",
        hi2zh: "请将图片中的印地文文本翻译并替换为自然、通顺的简体中文。",
        fi2zh: "请将图片中的芬兰文文本翻译并替换为自然、通顺的简体中文。",
        ja2en: "Please translate Japanese text in the image to natural English and replace it in place.",
        th2en: "Please translate Thai text in the image to natural English and replace it in place.",
        es2en: "Please translate Spanish text in the image to natural English and replace it in place.",
        ar2en: "Please translate Arabic text in the image to natural English and replace it in place.",
        id2en: "Please translate Indonesian text in the image to natural English and replace it in place.",
        hi2en: "Please translate Hindi text in the image to natural English and replace it in place.",
        fi2en: "Please translate Finnish text in the image to natural English and replace it in place.",
        en2ja: "画像内の英語テキストを自然な日本語に翻訳し、元位置に置き換えてください。",
        ja2id: "Tolong terjemahkan teks Jepang pada gambar ke Bahasa Indonesia alami dan gantikan di posisi aslinya.",
        en2id: "Tolong terjemahkan teks Inggris pada gambar ke Bahasa Indonesia alami dan gantikan di posisi aslinya.",
        th2id: "Tolong terjemahkan teks Thai pada gambar ke Bahasa Indonesia alami dan gantikan di posisi aslinya.",
        es2id: "Tolong terjemahkan teks Spanyol pada gambar ke Bahasa Indonesia alami dan gantikan di posisi aslinya.",
        ar2id: "Tolong terjemahkan teks Arab pada gambar ke Bahasa Indonesia alami dan gantikan di posisi aslinya.",
        ja2hi: "कृपया चित्र में मौजूद जापानी पाठ को स्वाभाविक हिंदी में अनुवाद करके उसी स्थान पर बदलें।",
        en2hi: "कृपया चित्र में मौजूद अंग्रेज़ी पाठ को स्वाभाविक हिंदी में अनुवाद करके उसी स्थान पर बदलें।",
        en2ar: "يرجى ترجمة النص الإنجليزي في الصورة إلى العربية الطبيعية واستبداله في نفس الموضع.",
        ja2ar: "يرجى ترجمة النص الياباني في الصورة إلى العربية الطبيعية واستبداله في نفس الموضع.",
        en2fi: "Käännä kuvassa oleva englanninkielinen teksti sujuvaksi suomeksi ja korvaa se alkuperäiseen paikkaan.",
        ja2fi: "Käännä kuvassa oleva japaninkielinen teksti sujuvaksi suomeksi ja korvaa se alkuperäiseen paikkaan.",
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
    const sourceLangLabel = sourceLanguageAllowlist.length
        ? sourceLanguageAllowlist.map((code) => getSourceLanguageLabel(code)).join("、")
        : directionMeta.sourceLangLabel
    const preferredFontRule = preferredFontFamily
        ? `字体指定：优先使用“${preferredFontFamily}”，若不可用则使用风格最接近字体。`
        : "字体指定：未指定额外字体时，优先匹配原文字体风格。"

    return [
        '你是漫画局部翻译修图引擎，只输出编辑后的图片。',
        '硬性要求：',
        '1) 只替换原有文字，人物、线条、网点、气泡形状和背景必须保持不变。',
        '2) 输出必须与输入区域视觉一致，不要额外边框、不要裁切、不要改变构图。',
        '3) 先清除原文再排版，避免重影、乱码、错位和符号拆分（例如 “（）” 分离）。',
        `4) 将原文从${sourceLangLabel}翻译为${directionMeta.targetLangLabel}。`,
        `5) ${layoutRule}`,
        `6) ${comicRule}`,
        `7) ${stylePresetRule}`,
        `8) ${preferredFontRule}`,
        '9) 字体风格必须贴近原文：保持原有字重、笔画粗细、描边/阴影、间距、大小与排版密度；避免使用通用默认字体感。',
        '10) 颜色风格必须贴近原文：优先保留原文字色与描边颜色，禁止把所有文本统一改成纯黑；仅当原文本身近似纯黑时才可使用黑字。',
        '11) 文本应继续落在原气泡可读区域内，行数与对齐尽量接近原文，避免明显溢出或留白异常。',
        '12) 翻译要贴合语境、口语自然，可适度意译但不能改变剧情信息。',
        '13) 严禁只擦除不重绘：最终图片中每个对白区域都必须有清晰可读的目标语言文本，不能留空白块。',
        '14) 若个别词无法识别，可用最接近语境的保守译法或音译占位，但绝不能留空。',
        '15) 仅返回图片，不要返回说明文本。',
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

function mapGeminiImageSizeToOpenAISize(imageSize: ImageSizeOption): string {
    if (imageSize === "1K") return "1024x1024"
    if (imageSize === "2K") return "2048x2048"
    return "4096x4096"
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

function normalizeDataImageUri(input: string): string | null {
    const text = String(input || '').trim()
    if (!text) return null
    const match = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i)
    if (!match) return null
    const mimeType = match[1].toLowerCase()
    const payload = match[2].replace(/\s+/g, '')
    if (!payload) return null
    return `data:${mimeType};base64,${payload}`
}

function normalizeRawBase64ImagePayload(input: string, mimeType = "image/png"): string | null {
    const text = String(input || "").trim().replace(/\s+/g, "")
    if (!text || text.length < 128) return null
    if (!/^[a-zA-Z0-9+/_-]+={0,2}$/.test(text)) return null
    if (text.length % 4 !== 0) return null
    return `data:${mimeType};base64,${text}`
}

function extractDataImageFromText(raw: string): string | null {
    const text = String(raw || '').trim()
    if (!text) return null

    const direct = normalizeDataImageUri(text)
    if (direct) return direct

    const rawBase64 = normalizeRawBase64ImagePayload(text)
    if (rawBase64) return rawBase64

    const markdownMatch = text.match(/!\[[^\]]*]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/i)
    if (markdownMatch?.[1]) {
        const normalized = normalizeDataImageUri(markdownMatch[1])
        if (normalized) return normalized
    }

    const htmlMatch = text.match(/src=["'](data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+)["']/i)
    if (htmlMatch?.[1]) {
        const normalized = normalizeDataImageUri(htmlMatch[1])
        if (normalized) return normalized
    }

    const embeddedMatch = text.match(/(data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+)/i)
    if (embeddedMatch?.[1]) {
        const normalized = normalizeDataImageUri(embeddedMatch[1])
        if (normalized) return normalized
    }

    return null
}

function extractDataImageFromUnknown(payload: unknown): string | null {
    if (typeof payload === 'string') {
        return extractDataImageFromText(payload)
    }

    if (Array.isArray(payload)) {
        for (const item of payload) {
            const found = extractDataImageFromUnknown(item)
            if (found) return found
        }
        return null
    }

    if (!payload || typeof payload !== 'object') return null
    const obj = payload as Record<string, unknown>

    const directKeyCandidates = [
        'image',
        'imageData',
        'image_base64',
        'imageBase64',
        'base64',
        'b64_json',
        'b64Json',
        'url',
        'content',
        'text',
    ]
    for (const key of directKeyCandidates) {
        if (!(key in obj)) continue
        const value = obj[key]
        if (
            typeof value === "string" &&
            (key === "b64_json" || key === "b64Json" || key === "base64" || key === "image_base64" || key === "imageBase64")
        ) {
            const normalized = normalizeRawBase64ImagePayload(value)
            if (normalized) return normalized
        }
        const found = extractDataImageFromUnknown(value)
        if (found) return found
    }

    for (const value of Object.values(obj)) {
        const found = extractDataImageFromUnknown(value)
        if (found) return found
    }
    return null
}

function normalizeHttpImageUrl(input: string): string | null {
    const text = String(input || "").trim()
    if (!text) return null
    try {
        const url = new URL(text)
        if (url.protocol === "http:" || url.protocol === "https:") {
            return url.toString()
        }
    } catch {
        return null
    }
    return null
}

function extractHttpImageUrlFromText(raw: string): string | null {
    const text = String(raw || "").trim()
    if (!text) return null

    const direct = normalizeHttpImageUrl(text)
    if (direct) return direct

    const markdownMatch = text.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i)
    if (markdownMatch?.[1]) {
        const normalized = normalizeHttpImageUrl(markdownMatch[1])
        if (normalized) return normalized
    }

    const htmlMatch = text.match(/src=["'](https?:\/\/[^"']+)["']/i)
    if (htmlMatch?.[1]) {
        const normalized = normalizeHttpImageUrl(htmlMatch[1])
        if (normalized) return normalized
    }

    const embeddedMatch = text.match(/\b(https?:\/\/[^\s"')]+)\b/i)
    if (embeddedMatch?.[1]) {
        const normalized = normalizeHttpImageUrl(embeddedMatch[1])
        if (normalized) return normalized
    }

    return null
}

function extractHttpImageUrlFromUnknown(payload: unknown): string | null {
    if (typeof payload === "string") {
        return extractHttpImageUrlFromText(payload)
    }

    if (Array.isArray(payload)) {
        for (const item of payload) {
            const found = extractHttpImageUrlFromUnknown(item)
            if (found) return found
        }
        return null
    }

    if (!payload || typeof payload !== "object") return null
    const obj = payload as Record<string, unknown>

    const keyCandidates = [
        "url",
        "image_url",
        "imageUrl",
        "image",
        "href",
    ]
    for (const key of keyCandidates) {
        if (!(key in obj)) continue
        const found = extractHttpImageUrlFromUnknown(obj[key])
        if (found) return found
    }

    for (const value of Object.values(obj)) {
        const found = extractHttpImageUrlFromUnknown(value)
        if (found) return found
    }

    return null
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const maybeBuffer = (
        globalThis as unknown as {
            Buffer?: {
                from: (input: ArrayBuffer) => { toString: (encoding: string) => string }
            }
        }
    ).Buffer
    if (maybeBuffer) {
        return maybeBuffer.from(buffer).toString("base64")
    }

    const bytes = new Uint8Array(buffer)
    let binary = ""
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize)
        binary += String.fromCharCode(...chunk)
    }

    if (typeof btoa === "function") {
        return btoa(binary)
    }

    throw new Error("No base64 encoder available in current runtime")
}

function guessImageMimeTypeFromUrl(url: string): string | null {
    const pathname = (() => {
        try {
            return new URL(url).pathname.toLowerCase()
        } catch {
            return ""
        }
    })()
    if (!pathname) return null
    if (pathname.endsWith(".png")) return "image/png"
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg"
    if (pathname.endsWith(".webp")) return "image/webp"
    if (pathname.endsWith(".gif")) return "image/gif"
    if (pathname.endsWith(".bmp")) return "image/bmp"
    if (pathname.endsWith(".avif")) return "image/avif"
    return null
}

async function fetchRemoteImageAsDataUri(imageUrl: string): Promise<string | null> {
    // Only resolve remote image URLs in the browser to avoid server-side SSRF risk.
    if (typeof window === "undefined") return null
    try {
        const response = await fetchWithTimeout(
            imageUrl,
            {
                method: "GET",
            },
            60_000
        )
        if (!response.ok) return null

        const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
        const inferredMimeType = contentType.startsWith("image/")
            ? contentType
            : (guessImageMimeTypeFromUrl(imageUrl) || "image/png")
        const raw = await response.arrayBuffer()
        if (raw.byteLength <= 0) return null
        const payload = arrayBufferToBase64(raw)
        return `data:${inferredMimeType};base64,${payload}`
    } catch {
        return null
    }
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

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(1, Math.max(0, value))
}

function normalizeSourceLanguageCode(input: string): SourceLanguageCode | undefined {
    const raw = input.trim()
    if (!raw) return undefined
    const lowered = raw.toLowerCase()
    if (/^(ja|jp|jpn)\b/.test(lowered) || /(japanese|日本|日语|日文)/i.test(raw)) return "ja"
    if (/^(en|eng)\b/.test(lowered) || /(english|英语|英文)/i.test(raw)) return "en"
    if (/^(th|tha)\b/.test(lowered) || /(thai|泰语|泰文)/i.test(raw)) return "th"
    if (/^(es|spa)\b/.test(lowered) || /(spanish|español|西班牙语|西文)/i.test(raw)) return "es"
    if (/^(ar|ara)\b/.test(lowered) || /(arabic|阿拉伯语|阿文)/i.test(raw)) return "ar"
    if (/^(id|ind)\b/.test(lowered) || /(indonesian|bahasa indonesia|印尼语|印尼文)/i.test(raw)) return "id"
    if (/^(hi|hin)\b/.test(lowered) || /(hindi|हिन्दी|印地语|印地文)/i.test(raw)) return "hi"
    if (/^(fi|fin)\b/.test(lowered) || /(finnish|suomi|芬兰语|芬兰文)/i.test(raw)) return "fi"
    return undefined
}

export function normalizeSourceLanguageAllowlist(input?: string[]): SourceLanguageCode[] {
    if (!Array.isArray(input)) return []
    const normalized = input
        .flatMap((item) => {
            if (typeof item !== "string") return []
            const code = normalizeSourceLanguageCode(item)
            return code ? [code] : []
        })
    return [...new Set(normalized)]
}

function inferSourceLanguageFromText(text: string): SourceLanguageCode | "latin" | undefined {
    const raw = text.trim()
    if (!raw) return undefined
    if (/[\u0600-\u06ff]/.test(raw)) return "ar"
    if (/[\u0e00-\u0e7f]/.test(raw)) return "th"
    if (/[\u0900-\u097f]/.test(raw)) return "hi"
    if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(raw)) return "ja"
    if (/[ñáéíóúü¡¿]/i.test(raw)) return "es"
    if (/[äöå]/i.test(raw)) return "fi"
    if (/[A-Za-z]/.test(raw)) return "latin"
    if (/[\u4e00-\u9fff]/.test(raw)) return "ja"
    return undefined
}

export function filterBlocksBySourceLanguageAllowlist(
    blocks: DetectedTextBlock[],
    allowlist?: string[]
): DetectedTextBlock[] {
    const allowed = normalizeSourceLanguageAllowlist(allowlist)
    if (!allowed.length) return blocks

    const allowedSet = new Set(allowed)
    const latinFriendly = allowedSet.has("en") || allowedSet.has("es") || allowedSet.has("id") || allowedSet.has("fi")

    return blocks.filter((block) => {
        const declared = normalizeSourceLanguageCode(block.sourceLanguage || "")
        if (declared) {
            return allowedSet.has(declared)
        }

        const text = [block.sourceText, ...(block.lines || [])]
            .join(" ")
            .trim()
        const inferred = inferSourceLanguageFromText(text)
        if (!inferred) return false
        if (inferred === "latin") return latinFriendly
        return allowedSet.has(inferred)
    })
}

function normalizeDetectionRegions(regions?: TextDetectionRegion[]): TextDetectionRegion[] {
    if (!Array.isArray(regions)) return []
    return regions
        .map((region) => ({
            x: clamp01(region.x),
            y: clamp01(region.y),
            width: clamp01(region.width),
            height: clamp01(region.height),
        }))
        .filter((region) => region.width > 0 && region.height > 0)
}

function intersectsNormalizedRect(
    a: TextDetectionRegion,
    b: TextDetectionRegion
): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

function filterBlocksByDetectionRegions(
    blocks: DetectedTextBlock[],
    includeRegions?: TextDetectionRegion[],
    excludeRegions?: TextDetectionRegion[]
): DetectedTextBlock[] {
    const include = normalizeDetectionRegions(includeRegions)
    const exclude = normalizeDetectionRegions(excludeRegions)
    if (!include.length && !exclude.length) return blocks

    return blocks.filter((block) => {
        const bbox: TextDetectionRegion = {
            x: block.bbox.x,
            y: block.bbox.y,
            width: block.bbox.width,
            height: block.bbox.height,
        }
        if (include.length && !include.some((region) => intersectsNormalizedRect(bbox, region))) {
            return false
        }
        if (exclude.length && exclude.some((region) => intersectsNormalizedRect(bbox, region))) {
            return false
        }
        return true
    })
}

export function getDetectionTargetLanguageFromDirection(direction: TranslationDirection): string {
    const meta = getTranslationDirectionMeta(direction)
    if (meta.targetLangCode === "en") return "English"
    if (meta.targetLangCode === "ja") return "日本語"
    if (meta.targetLangCode === "ar") return "العربية"
    if (meta.targetLangCode === "id") return "Bahasa Indonesia"
    if (meta.targetLangCode === "hi") return "हिन्दी"
    if (meta.targetLangCode === "fi") return "Suomi"
    return "简体中文"
}

export function filterBlocksByAngleThreshold(
    blocks: DetectedTextBlock[],
    thresholdDegrees: number,
    enabled: boolean
): DetectedTextBlock[] {
    if (!enabled) return blocks
    const threshold = Math.max(0, Number.isFinite(thresholdDegrees) ? thresholdDegrees : 0)
    return blocks.filter((block) => {
        const angle = block.style?.angle
        if (typeof angle !== "number" || !Number.isFinite(angle)) {
            return true
        }
        return Math.abs(angle) <= threshold
    })
}

function isLikelyKanaString(text: string): boolean {
    const compact = text.replace(/\s+/g, "")
    if (!compact) return false
    const kanaMatches = compact.match(/[\u3040-\u30ff\u31f0-\u31ffー]/g) || []
    const kanaRatio = kanaMatches.length / compact.length
    const hasKanji = /[\u4e00-\u9fff]/.test(compact)
    return !hasKanji && kanaRatio >= 0.75 && compact.length <= 12
}

function intersectsWithMargin(
    a: TextBlockBBox,
    b: TextBlockBBox,
    margin: number
): boolean {
    return (
        a.x - margin < b.x + b.width &&
        a.x + a.width + margin > b.x &&
        a.y - margin < b.y + b.height &&
        a.y + a.height + margin > b.y
    )
}

export function filterLikelyFuriganaBlocks(
    blocks: DetectedTextBlock[],
    enabled: boolean
): DetectedTextBlock[] {
    if (!enabled) return blocks
    if (blocks.length <= 1) return blocks

    const blockAreas = blocks.map((block) => Math.max(0, block.bbox.width * block.bbox.height))

    return blocks.filter((block, index) => {
        const source = (block.sourceText || "").trim()
        if (!source) return false
        if (!isLikelyKanaString(source)) return true

        const bbox = block.bbox
        const area = blockAreas[index]
        const minEdge = Math.min(bbox.width, bbox.height)
        const maxEdge = Math.max(bbox.width, bbox.height)
        const smallCandidate = area <= 0.018 || minEdge <= 0.035 || maxEdge <= 0.16
        if (!smallCandidate) {
            return true
        }

        const hasNearbyMainText = blocks.some((other, otherIndex) => {
            if (otherIndex === index) return false
            const otherText = (other.sourceText || "").trim()
            if (!otherText) return false
            if (isLikelyKanaString(otherText)) return false
            const otherArea = blockAreas[otherIndex]
            if (otherArea < area * 2.2) return false
            return intersectsWithMargin(bbox, other.bbox, 0.03)
        })

        return !hasNearbyMainText
    })
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

function buildImageSentencePrompt(
    targetLanguage: string,
    options?: { sourceLanguageHint?: string; extraPrompt?: string }
): string {
    const sourceHint = options?.sourceLanguageHint?.trim()
    const extraPrompt = options?.extraPrompt?.trim()
    return [
        sourceHint ? `源语言提示：${sourceHint}` : "源语言提示：自动识别",
        `请只提取这张截图中的完整句子并翻译为${targetLanguage}。`,
        "如果原图是被拆分的散句，请按语义重组为完整句子再翻译。",
        "只返回译文本身，不要输出解释、前缀、JSON、markdown、思考过程。",
        extraPrompt ? `补充要求：${extraPrompt}` : "",
    ].filter(Boolean).join("\n")
}

function extractVisionTranslatedText(rawText: string): string {
    const normalizedRaw = String(rawText || "").trim()
    if (!normalizedRaw) return ""

    const parsed = parseJsonFromText(normalizedRaw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>
        const fromKey = String(
            obj.translation ??
            obj.translatedText ??
            obj.text ??
            obj.content ??
            ""
        ).trim()
        if (fromKey) return fromKey
    }
    return normalizedRaw
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

    const apiUrl = buildGeminiGenerateContentApiUrl(config, model)
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
    const baseUrl = resolveOpenAIBaseUrl(config)
    const model = config.model || 'gpt-4o'
    const imageSize = normalizeGeminiImageSize(config.imageSize)
    const isGeminiModel = /^gemini-/i.test(model.trim())

    try {
        const createRequestPayload = (enableGeminiHints: boolean) => {
            const payload: Record<string, unknown> = {
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
            }

            if (enableGeminiHints && isGeminiModel) {
                payload.modalities = ['text', 'image']
                payload.response_format = { type: 'b64_json' }
                payload.generationConfig = {
                    responseModalities: ['TEXT', 'IMAGE'],
                }

                if (imageSize) {
                    payload.image_size = imageSize
                    payload.imageSize = imageSize
                    payload.size = mapGeminiImageSizeToOpenAISize(imageSize)
                    ;(payload.generationConfig as Record<string, unknown>).imageConfig = {
                        imageSize,
                    }
                }
            }

            return payload
        }

        const sendRequest = (enableGeminiHints: boolean) =>
            fetchWithTimeout(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify(createRequestPayload(enableGeminiHints)),
            })

        let response = await sendRequest(isGeminiModel)
        if (!response.ok && isGeminiModel && response.status === 400) {
            const apiError = await readApiError(response)
            const shouldRetryWithoutHints =
                /Unknown name|Invalid JSON payload|unsupported|unrecognized|extra inputs|additional properties|imageSize|image_size|responseModalities|generationConfig/i.test(apiError)
            if (shouldRetryWithoutHints) {
                response = await sendRequest(false)
            } else {
                throw new Error(`OpenAI API ${response.status}: ${apiError}`)
            }
        }

        if (!response.ok) {
            const apiError = await readApiError(response)
            throw new Error(`OpenAI API ${response.status}: ${apiError}`)
        }

        const data = await response.json()
        const rawMessage = data.choices?.[0]?.message
        const rawContent = rawMessage?.content
        const extractionTargets: unknown[] = [
            rawContent,
            rawMessage,
            data.choices?.[0],
            data.output,
            data.data,
            data,
        ]

        for (const target of extractionTargets) {
            const extracted = extractDataImageFromUnknown(target)
            if (extracted) {
                return {
                    success: true,
                    imageData: extracted,
                }
            }
        }

        const visitedRemoteUrls = new Set<string>()
        for (const target of extractionTargets) {
            const remoteUrl = extractHttpImageUrlFromUnknown(target)
            if (!remoteUrl || visitedRemoteUrls.has(remoteUrl)) continue
            visitedRemoteUrls.add(remoteUrl)

            const downloaded = await fetchRemoteImageAsDataUri(remoteUrl)
            if (downloaded) {
                return {
                    success: true,
                    imageData: downloaded,
                }
            }
        }

        const content = Array.isArray(rawContent)
            ? rawContent.map((item: { text?: string }) => item?.text || '').join('\n')
            : rawContent

        // OpenAI 通常不直接返回图片，这里需要特殊处理
        // 如果使用的是支持图像生成的兼容接口，需要解析响应
        if (typeof content === 'string' && content) {
            // 检查是否是 base64 图片
            const extractedFromContent = extractDataImageFromText(content)
            if (extractedFromContent) {
                return {
                    success: true,
                    imageData: extractedFromContent,
                }
            }

            // 尝试从 JSON 响应中提取图片
            try {
                const parsed = JSON.parse(content)
                const extractedFromParsed = extractDataImageFromUnknown(parsed)
                if (extractedFromParsed) {
                    return {
                        success: true,
                        imageData: extractedFromParsed,
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

function buildDetectionPrompt(
    targetLanguage: string,
    options?: {
        sourceLanguageHint?: string
        sourceLanguageAllowlist?: string[]
        includeRegions?: TextDetectionRegion[]
        excludeRegions?: TextDetectionRegion[]
    }
): string {
    const includeRegions = normalizeDetectionRegions(options?.includeRegions)
    const excludeRegions = normalizeDetectionRegions(options?.excludeRegions)
    const sourceLanguageHint = options?.sourceLanguageHint?.trim()
    const sourceLanguageAllowlist = normalizeSourceLanguageAllowlist(options?.sourceLanguageAllowlist)
    const sourceAllowlistLabels = sourceLanguageAllowlist.map((code) => getSourceLanguageLabel(code))
    return [
        `请检测图片中的所有文本块，并翻译为${targetLanguage}。`,
        sourceLanguageHint ? `源语言提示：优先识别${sourceLanguageHint}文本。` : "源语言提示：自动识别。",
        sourceAllowlistLabels.length
            ? `只识别以下源语言：${sourceAllowlistLabels.join("、")}。其他语言或噪声符号不要输出。`
            : "若未提供源语言白名单，则按模型自动识别。",
        includeRegions.length
            ? `只检测以下给定区域（0-1 归一化 bbox，JSON 数组）：${JSON.stringify(includeRegions.slice(0, 80))}`
            : "若未提供检测区域，则默认检测整张图。",
        excludeRegions.length
            ? `忽略以下区域中的文本（0-1 归一化 bbox，JSON 数组）：${JSON.stringify(excludeRegions.slice(0, 80))}`
            : "若未提供忽略区域，则不额外排除。",
        '输出必须是 JSON，格式如下：',
        '{"blocks":[{"sourceText":"原文","translatedText":"译文","sourceLanguage":"ja","bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.15},"lines":["..."],"segments":[{"x":0.1,"y":0.2,"width":0.3,"height":0.06}],"style":{"textColor":"#000000","outlineColor":"#ffffff","strokeColor":"#ffffff","strokeWidth":1,"textOpacity":1,"fontFamily":"Noto Sans CJK SC","angle":0,"orientation":"vertical","alignment":"center","fontWeight":"bold"}}]}',
        '要求：',
        '1) bbox 使用 0-1 归一化坐标（相对整张图），x/y 为左上角。',
        '2) lines 返回按阅读顺序拆分后的文本行；segments 返回更细粒度文本分割框（可选）。',
        '3) style 需估计颜色、轮廓、角度、朝向、对齐和字重（可选，但尽量提供）。',
        '4) 只输出 JSON，不要输出 markdown 或解释。',
        '5) translatedText 使用自然、口语化译文。',
        sourceAllowlistLabels.length
            ? `6) 只返回${sourceAllowlistLabels.join("、")}文本块；其他语言与乱码符号禁止输出。`
            : '6) 若无法判断语言，可按上下文保守处理。',
        includeRegions.length ? '7) 严格遵守检测区域，区域外文本不要输出。' : '7) 尽可能完整覆盖全图文本。',
        excludeRegions.length ? '8) 严格忽略指定区域中的文本。' : '8) 无额外忽略区域时按整图规则处理。',
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
    const apiUrl = buildGeminiGenerateContentApiUrl(config, model)
    const prompt = buildDetectionPrompt(targetLanguage, {
        sourceLanguageHint: request.sourceLanguageHint,
        sourceLanguageAllowlist: request.sourceLanguageAllowlist,
        includeRegions: request.includeRegions,
        excludeRegions: request.excludeRegions,
    })

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
        const blocks = filterBlocksBySourceLanguageAllowlist(
            filterBlocksByDetectionRegions(
            normalizeDetectedBlocks(parsed),
            request.includeRegions,
            request.excludeRegions
            ),
            request.sourceLanguageAllowlist
        )

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
    const prompt = buildDetectionPrompt(targetLanguage, {
        sourceLanguageHint: request.sourceLanguageHint,
        sourceLanguageAllowlist: request.sourceLanguageAllowlist,
        includeRegions: request.includeRegions,
        excludeRegions: request.excludeRegions,
    })
    const baseUrl = resolveOpenAIBaseUrl(config)

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
        const blocks = filterBlocksBySourceLanguageAllowlist(
            filterBlocksByDetectionRegions(
            normalizeDetectedBlocks(parsed),
            request.includeRegions,
            request.excludeRegions
            ),
            request.sourceLanguageAllowlist
        )

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

async function translateImageSentenceWithGemini(
    request: TranslateImageSentenceRequest
): Promise<TranslateImageSentenceResponse> {
    const model = (request.config.model || "gemini-2.5-flash").trim()
    const prompt = buildImageSentencePrompt(request.targetLanguage, {
        sourceLanguageHint: request.sourceLanguageHint,
        extraPrompt: request.extraPrompt,
    })
    const apiUrl = buildGeminiGenerateContentApiUrl(request.config, model)

    try {
        const response = await fetchWithTimeout(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: "image/png",
                                data: request.imageData.replace(/^data:image\/\w+;base64,/, ""),
                            },
                        },
                        { text: prompt },
                    ],
                }],
                generationConfig: {
                    temperature: 0.2,
                },
            }),
        })

        if (!response.ok) {
            const apiError = await readApiError(response)
            return {
                success: false,
                error: `Gemini vision translate ${response.status}: ${apiError}`,
            }
        }

        const data = await response.json()
        const parts = data.candidates?.[0]?.content?.parts || []
        const rawText = parts
            .map((part: { text?: string }) => (typeof part?.text === "string" ? part.text : ""))
            .join("\n")
            .trim()
        const translatedText = sanitizeModelText(extractVisionTranslatedText(rawText), { enabled: Boolean(request.stripReasoningContent) })
        if (!translatedText) {
            return {
                success: false,
                raw: rawText,
                error: "未返回有效译文",
            }
        }

        return {
            success: true,
            translatedText,
            raw: rawText,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        }
    }
}

async function translateImageSentenceWithOpenAI(
    request: TranslateImageSentenceRequest
): Promise<TranslateImageSentenceResponse> {
    const baseUrl = resolveOpenAIBaseUrl(request.config)
    const model = request.config.model || "gpt-4o-mini"
    const prompt = buildImageSentencePrompt(request.targetLanguage, {
        sourceLanguageHint: request.sourceLanguageHint,
        extraPrompt: request.extraPrompt,
    })

    try {
        const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${request.config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: { url: request.imageData },
                            },
                            {
                                type: "text",
                                text: prompt,
                            },
                        ],
                    },
                ],
                temperature: 0.2,
                max_tokens: 800,
            }),
        })

        if (!response.ok) {
            const apiError = await readApiError(response)
            return {
                success: false,
                error: `OpenAI vision translate ${response.status}: ${apiError}`,
            }
        }

        const data = await response.json()
        const rawContent = data.choices?.[0]?.message?.content
        const rawText = Array.isArray(rawContent)
            ? rawContent.map((item: { text?: string }) => item?.text || "").join("\n")
            : String(rawContent || "")
        const translatedText = sanitizeModelText(extractVisionTranslatedText(rawText), { enabled: Boolean(request.stripReasoningContent) })
        if (!translatedText) {
            return {
                success: false,
                raw: rawText,
                error: "未返回有效译文",
            }
        }

        return {
            success: true,
            translatedText,
            raw: rawText,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        }
    }
}

type DetectCacheEntry = {
    expiresAt: number
    response: DetectTextResponse
}

const DETECT_CACHE_TTL_MS = 30 * 60 * 1000
const DETECT_CACHE_MAX_ENTRIES = 200
const detectResponseCache = new Map<string, DetectCacheEntry>()

function hashString(input: string): string {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash +=
            (hash << 1) +
            (hash << 4) +
            (hash << 7) +
            (hash << 8) +
            (hash << 24)
    }
    return (hash >>> 0).toString(16)
}

function buildDetectionCacheKey(request: DetectTextRequest): string {
    const imageHash = hashString(request.imageData.replace(/^data:image\/\w+;base64,/, ""))
    const include = normalizeDetectionRegions(request.includeRegions)
        .map((region) => `${region.x.toFixed(4)},${region.y.toFixed(4)},${region.width.toFixed(4)},${region.height.toFixed(4)}`)
        .join("|")
    const exclude = normalizeDetectionRegions(request.excludeRegions)
        .map((region) => `${region.x.toFixed(4)},${region.y.toFixed(4)},${region.width.toFixed(4)},${region.height.toFixed(4)}`)
        .join("|")
    const allowlist = normalizeSourceLanguageAllowlist(request.sourceLanguageAllowlist).sort().join(",")
    return [
        request.config.provider,
        request.config.model || "",
        request.targetLanguage || "简体中文",
        request.sourceLanguageHint || "",
        allowlist,
        include,
        exclude,
        imageHash,
    ].join("::")
}

function cloneDetectedBlocks(blocks: DetectedTextBlock[]): DetectedTextBlock[] {
    return blocks.map((block) => ({
        ...block,
        bbox: { ...block.bbox },
        lines: block.lines ? [...block.lines] : undefined,
        segments: block.segments?.map((segment) => ({ ...segment })),
        style: block.style ? { ...block.style } : undefined,
    }))
}

function getCachedDetectResponse(cacheKey: string): DetectTextResponse | null {
    const hit = detectResponseCache.get(cacheKey)
    if (!hit) return null
    if (hit.expiresAt < Date.now()) {
        detectResponseCache.delete(cacheKey)
        return null
    }
    return {
        success: true,
        blocks: cloneDetectedBlocks(hit.response.blocks),
        raw: hit.response.raw,
    }
}

function setCachedDetectResponse(cacheKey: string, response: DetectTextResponse): void {
    if (!response.success) return
    if (detectResponseCache.size >= DETECT_CACHE_MAX_ENTRIES) {
        const firstKey = detectResponseCache.keys().next().value
        if (firstKey) {
            detectResponseCache.delete(firstKey)
        }
    }
    detectResponseCache.set(cacheKey, {
        expiresAt: Date.now() + DETECT_CACHE_TTL_MS,
        response: {
            success: true,
            blocks: cloneDetectedBlocks(response.blocks),
            raw: response.raw,
        },
    })
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

    const cacheKey = buildDetectionCacheKey(request)
    const cached = getCachedDetectResponse(cacheKey)
    if (cached) {
        return cached
    }

    const response = config.provider === 'gemini'
        ? await detectWithGemini(request)
        : await detectWithOpenAI(request)

    if (response.success) {
        setCachedDetectResponse(cacheKey, response)
    }

    return response
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

export async function translateImageSentence(
    request: TranslateImageSentenceRequest
): Promise<TranslateImageSentenceResponse> {
    const { config } = request
    if (!config.apiKey) {
        return {
            success: false,
            error: "请先配置 API Key",
        }
    }
    if (config.provider === "gemini") {
        return translateImageSentenceWithGemini(request)
    }
    return translateImageSentenceWithOpenAI(request)
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

import type { AIConfig } from "@/lib/ai/ai-service"
import { sanitizeModelText } from "@/lib/utils/text-sanitizer"

export type BatchTranslateItem = {
    id: string
    content: string
}

export type BatchTranslateRequest = {
    items: BatchTranslateItem[]
    targetLanguage: string
    config: AIConfig
    contextHint?: string
    stripReasoningContent?: boolean
}

export type BatchTranslateResponse = {
    success: boolean
    items: BatchTranslateItem[]
    raw?: string
    error?: string
}

const REQUEST_TIMEOUT_MS = 60_000

function truncate(text: string, maxLen = 220): string {
    if (text.length <= maxLen) return text
    return `${text.slice(0, maxLen)}...`
}

function buildSystemPrompt(targetLanguage: string): string {
    return [
        "你是一个专业的翻译引擎。",
        `请将用户提供的多段文本翻译成${targetLanguage}。`,
        "你会分析语句之间联系，然后给出最符合语境的翻译结果。",
        "当文本中包含特殊字符（如大括号{}、引号\\\"\\\"、反斜杠等）时，请原样保留。",
        "请严格按照 JSON 数组返回结果，不要添加任何额外解释。",
        "输出格式：[{\"id\":\"1\",\"content\":\"译文\"}]",
    ].join("\n")
}

function buildUserPrompt(items: BatchTranslateItem[], contextHint?: string): string {
    const payload = JSON.stringify(items)
    if (!contextHint?.trim()) {
        return payload
    }
    return [
        `上下文提示：${contextHint.trim()}`,
        payload,
    ].join("\n")
}

function parseJsonFromText(raw: string): unknown {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
        return JSON.parse(trimmed)
    } catch {
        // continue
    }
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (codeBlock?.[1]) {
        try {
            return JSON.parse(codeBlock[1].trim())
        } catch {
            // continue
        }
    }
    const arrayStart = trimmed.indexOf("[")
    const arrayEnd = trimmed.lastIndexOf("]")
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        const snippet = trimmed.slice(arrayStart, arrayEnd + 1)
        try {
            return JSON.parse(snippet)
        } catch {
            // ignore
        }
    }
    return null
}

function normalizeResultItems(parsed: unknown, stripReasoningContent?: boolean): BatchTranslateItem[] {
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const source = item as Record<string, unknown>
        const id = String(source.id ?? source.index ?? "").trim()
        const rawContent = String(source.content ?? source.translatedText ?? source.translation ?? "").trim()
        const content = sanitizeModelText(rawContent, { enabled: Boolean(stripReasoningContent) })
        if (!id || !content) return []
        return [{ id, content }]
    })
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timer)
    }
}

async function readApiError(response: Response): Promise<string> {
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
        const json = await response.json().catch(() => null) as Record<string, unknown> | null
        if (json && typeof json.error === "string") return json.error
        const nested = json?.error
        if (nested && typeof nested === "object") {
            const message = (nested as Record<string, unknown>).message
            if (typeof message === "string") return message
        }
    }
    const text = await response.text().catch(() => "")
    return text || `HTTP ${response.status}`
}

async function translateWithGemini(request: BatchTranslateRequest): Promise<BatchTranslateResponse> {
    const model = (request.config.model || "").trim()
    const resolvedModel =
        model && model.startsWith("gemini-")
            ? (model.includes("image") ? "gemini-2.5-flash" : model)
            : "gemini-2.5-flash"
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${request.config.apiKey}`
    const systemPrompt = buildSystemPrompt(request.targetLanguage)
    const userPrompt = buildUserPrompt(request.items, request.contextHint)

    try {
        const response = await fetchWithTimeout(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                    },
                ],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json",
                },
            }),
        })

        if (!response.ok) {
            return {
                success: false,
                items: [],
                error: `Gemini ${response.status}: ${await readApiError(response)}`,
            }
        }

        const data = await response.json()
        const rawText = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "")
        const normalized = normalizeResultItems(parseJsonFromText(rawText), request.stripReasoningContent)
        if (!normalized.length) {
            return {
                success: false,
                items: [],
                raw: rawText,
                error: `Gemini 返回格式无效: ${truncate(rawText)}`,
            }
        }
        return {
            success: true,
            items: normalized,
            raw: rawText,
        }
    } catch (error) {
        return {
            success: false,
            items: [],
            error: error instanceof Error ? error.message : "Gemini 文本翻译失败",
        }
    }
}

async function translateWithOpenAI(request: BatchTranslateRequest): Promise<BatchTranslateResponse> {
    const baseUrl = request.config.baseUrl || "https://api.openai.com/v1"
    const model = request.config.model || "gpt-4o-mini"
    const systemPrompt = buildSystemPrompt(request.targetLanguage)
    const userPrompt = buildUserPrompt(request.items, request.contextHint)

    try {
        const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${request.config.apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
            }),
        })

        if (!response.ok) {
            return {
                success: false,
                items: [],
                error: `OpenAI ${response.status}: ${await readApiError(response)}`,
            }
        }

        const data = await response.json()
        const rawText = String(data?.choices?.[0]?.message?.content || "")
        const parsed = parseJsonFromText(rawText)
        const candidates = Array.isArray(parsed)
            ? parsed
            : (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).items)
                ? (parsed as Record<string, unknown>).items
                : [])
        const normalized = normalizeResultItems(candidates, request.stripReasoningContent)
        if (!normalized.length) {
            return {
                success: false,
                items: [],
                raw: rawText,
                error: `OpenAI 返回格式无效: ${truncate(rawText)}`,
            }
        }
        return {
            success: true,
            items: normalized,
            raw: rawText,
        }
    } catch (error) {
        return {
            success: false,
            items: [],
            error: error instanceof Error ? error.message : "OpenAI 文本翻译失败",
        }
    }
}

export async function translateTextBatch(
    request: BatchTranslateRequest
): Promise<BatchTranslateResponse> {
    const items = request.items
        .map((item) => ({
            id: String(item.id),
            content: String(item.content || "").trim(),
        }))
        .filter((item) => item.content)

    if (!items.length) {
        return {
            success: true,
            items: [],
        }
    }
    if (!request.config.apiKey) {
        return {
            success: false,
            items: [],
            error: "缺少 API Key",
        }
    }

    const payload: BatchTranslateRequest = {
        ...request,
        items,
    }
    if (request.config.provider === "gemini") {
        return translateWithGemini(payload)
    }
    return translateWithOpenAI(payload)
}

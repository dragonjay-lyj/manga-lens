export interface StripReasoningOptions {
    enabled?: boolean
}

const REASONING_BLOCK_PATTERNS: RegExp[] = [
    /<think\b[^>]*>[\s\S]*?<\/think>/gi,
    /<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi,
    /<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi,
    /<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi,
    /```(?:think|thinking|reasoning|analysis)[\s\S]*?```/gi,
]

const LEADING_REASONING_PREFIX_PATTERNS: RegExp[] = [
    /^(?:思考过程|推理过程|分析过程|chain of thought|internal reasoning|analysis)\s*[:：]\s*/i,
    /^(?:最终答案|最终结果|答案|结论|final answer|answer|result|translation)\s*[:：]\s*/i,
]

export function stripReasoningContent(rawText: string): string {
    let text = String(rawText || "")
    if (!text.trim()) return ""

    for (const pattern of REASONING_BLOCK_PATTERNS) {
        text = text.replace(pattern, "")
    }

    text = text
        .replace(/^\s*\[(?:thinking|reasoning|analysis)\][\s\S]*?\[\/(?:thinking|reasoning|analysis)\]\s*/gi, "")
        .replace(/^\s*<(?:think|thinking|reasoning|analysis)\b[^>]*>\s*/gi, "")
        .replace(/\s*<\/(?:think|thinking|reasoning|analysis)>\s*$/gi, "")

    // Remove a single leading marker if the model prepends "Final answer:" style text.
    for (const pattern of LEADING_REASONING_PREFIX_PATTERNS) {
        if (pattern.test(text)) {
            text = text.replace(pattern, "")
            break
        }
    }

    return text.trim()
}

export function sanitizeModelText(
    rawText: string,
    options?: StripReasoningOptions
): string {
    const enabled = options?.enabled ?? false
    const normalized = String(rawText || "").trim()
    if (!normalized) return ""
    if (!enabled) return normalized

    const stripped = stripReasoningContent(normalized)
    return stripped || normalized
}

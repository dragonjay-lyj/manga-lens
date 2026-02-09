import { zh } from "./zh"
import { en } from "./en"
import type { Messages } from "./zh"

export type Locale = "zh" | "en"

const messages: Record<Locale, Messages> = {
    zh,
    en,
}

export function getMessages(locale: Locale): Messages {
    return messages[locale] || messages.zh
}

export { zh, en }
export type { Messages }

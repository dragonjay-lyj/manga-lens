type OpenCcModule = {
    Converter: (options: { from: string; to: string }) => (input: string) => string
}

export type ChineseConvertMode = "s2t" | "t2s"

let converterS2T: ((input: string) => string) | null = null
let converterT2S: ((input: string) => string) | null = null
let converterInitPromise: Promise<void> | null = null

async function ensureConverters(): Promise<void> {
    if (converterS2T && converterT2S) return
    if (converterInitPromise) {
        await converterInitPromise
        return
    }

    converterInitPromise = (async () => {
        const openCc = await import("opencc-js") as unknown as OpenCcModule
        converterS2T = openCc.Converter({ from: "cn", to: "tw" })
        converterT2S = openCc.Converter({ from: "tw", to: "cn" })
    })()

    try {
        await converterInitPromise
    } finally {
        converterInitPromise = null
    }
}

export async function convertChineseText(input: string, mode: ChineseConvertMode): Promise<string> {
    const text = String(input || "")
    if (!text.trim()) return text
    await ensureConverters()
    if (mode === "s2t") {
        return converterS2T ? converterS2T(text) : text
    }
    return converterT2S ? converterT2S(text) : text
}

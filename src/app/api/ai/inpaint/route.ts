import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"
import { runLamaInpaint } from "@/lib/ai/lama-inpaint"
import { getSystemSettings } from "@/lib/settings"

type InpaintBody = {
    imageData?: string
    maskData?: string
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await ensureUserRecord(userId)

        const body = (await request.json()) as InpaintBody
        const imageData = body.imageData?.trim()
        const maskData = body.maskData?.trim()
        if (!imageData || !maskData) {
            return NextResponse.json({ error: "缺少 imageData 或 maskData" }, { status: 400 })
        }

        const settings = await getSystemSettings([
            "lama_inpaint_enabled",
            "lama_inpaint_base_url",
            "lama_inpaint_api_key",
        ])
        const enabled = settings.lama_inpaint_enabled === "true"
        const baseUrl = settings.lama_inpaint_base_url || process.env.LAMA_INPAINT_BASE_URL || ""
        const apiKey = settings.lama_inpaint_api_key || process.env.LAMA_INPAINT_API_KEY || ""

        if (!enabled) {
            return NextResponse.json({ error: "LAMA 修复服务未启用" }, { status: 503 })
        }
        if (!baseUrl) {
            return NextResponse.json({ error: "LAMA 修复服务地址未配置" }, { status: 503 })
        }

        const result = await runLamaInpaint(
            {
                baseUrl,
                apiKey,
            },
            {
                imageData,
                maskData,
            }
        )

        if (!result.success || !result.imageData) {
            return NextResponse.json(
                { error: result.error || "LAMA 修复失败" },
                { status: 502 }
            )
        }

        return NextResponse.json({
            success: true,
            imageData: result.imageData,
            provider: result.provider,
            model: result.model,
        })
    } catch (error) {
        console.error("LAMA inpaint error:", error)
        return NextResponse.json({ error: "修复失败" }, { status: 500 })
    }
}


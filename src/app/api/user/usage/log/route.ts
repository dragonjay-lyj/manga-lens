import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"

const ALLOWED_ACTIONS = new Set(["generate", "batch_generate", "export", "coin_consume"])

export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await ensureUserRecord(userId)
        const body = await request.json()
        const action = typeof body.action === "string" ? body.action.trim() : ""
        const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {}
        const creditsUsedValue = Number(body.creditsUsed || 0)
        const creditsUsed = Number.isFinite(creditsUsedValue) ? Math.max(0, Math.floor(creditsUsedValue)) : 0

        if (!action || !ALLOWED_ACTIONS.has(action)) {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 })
        }

        const supabaseAdmin = createServerClient()
        const { error } = await supabaseAdmin.from("usage_logs").insert({
            user_id: userId,
            action,
            metadata,
            credits_used: creditsUsed,
        })

        if (error) {
            console.error("Log usage error:", error)
            return NextResponse.json({ error: "记录使用日志失败" }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Log usage error:", error)
        return NextResponse.json({ error: "记录使用日志失败" }, { status: 500 })
    }
}

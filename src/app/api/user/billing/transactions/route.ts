import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"

const supabaseAdmin = createServerClient()

export async function GET(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const { user } = await ensureUserRecord(userId)

        const { searchParams } = new URL(request.url)
        const page = Math.max(1, Number(searchParams.get("page") || 1))
        const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 10)))
        const status = searchParams.get("status") || "all"
        const offset = (page - 1) * limit

        let query = supabaseAdmin
            .from("coin_transactions")
            .select("*", { count: "exact" })
            .eq("user_id", userId)
            .eq("type", "recharge")
            .order("created_at", { ascending: false })

        if (status !== "all") {
            query = query.eq("status", status)
        }

        const { data: transactions, error, count } = await query.range(offset, offset + limit - 1)
        if (error) {
            console.error("Get billing transactions error:", error)
            return NextResponse.json({ error: "获取账单失败" }, { status: 500 })
        }

        const [{ count: pendingCount }, { count: completedCount }, { count: failedCount }] = await Promise.all([
            supabaseAdmin
                .from("coin_transactions")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("type", "recharge")
                .eq("status", "pending"),
            supabaseAdmin
                .from("coin_transactions")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("type", "recharge")
                .eq("status", "completed"),
            supabaseAdmin
                .from("coin_transactions")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("type", "recharge")
                .eq("status", "failed"),
        ])

        return NextResponse.json({
            transactions: transactions || [],
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit),
            },
            balance: user.credits || 0,
            stats: {
                pending: pendingCount || 0,
                completed: completedCount || 0,
                failed: failedCount || 0,
            },
        })
    } catch (error) {
        console.error("Get billing transactions error:", error)
        return NextResponse.json({ error: "获取账单失败" }, { status: 500 })
    }
}

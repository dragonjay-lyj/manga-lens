import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/client"
import { requireAdmin } from "@/lib/auth/require-admin"

const supabaseAdmin = createServerClient()

export async function GET(request: Request) {
    try {
        const admin = await requireAdmin()
        if (!admin.ok) return admin.response

        const { searchParams } = new URL(request.url)
        const page = Math.max(1, Number(searchParams.get("page") || 1))
        const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)))
        const status = searchParams.get("status") || "all"
        const search = (searchParams.get("search") || "").trim()
        const onlyTimeout = searchParams.get("only_timeout") === "true"
        const timeoutMinutes = Math.max(1, Number(searchParams.get("timeout_minutes") || 30))
        const offset = (page - 1) * limit

        let query = supabaseAdmin
            .from("coin_transactions")
            .select("*", { count: "exact" })
            .eq("type", "recharge")

        if (status !== "all") {
            query = query.eq("status", status)
        }

        if (search) {
            query = query.or(`out_trade_no.ilike.%${search}%,trade_no.ilike.%${search}%,user_id.ilike.%${search}%`)
        }

        if (onlyTimeout) {
            const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString()
            query = query.eq("status", "pending").lt("created_at", cutoff)
        }

        const { data: transactions, error, count } = await query
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) {
            console.error("Get admin payments error:", error)
            return NextResponse.json({ error: "获取支付订单失败" }, { status: 500 })
        }

        const userIds = [...new Set((transactions || []).map(item => item.user_id).filter(Boolean))]
        const usersMap: Record<string, { id: string; email: string | null; username: string | null }> = {}

        if (userIds.length > 0) {
            const { data: users } = await supabaseAdmin
                .from("users")
                .select("id, email, username")
                .in("id", userIds)

            for (const user of users || []) {
                usersMap[user.id] = user
            }
        }

        return NextResponse.json({
            transactions: transactions || [],
            users: usersMap,
            timeoutMinutes,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit),
            },
        })
    } catch (error) {
        console.error("Get admin payments error:", error)
        return NextResponse.json({ error: "获取支付订单失败" }, { status: 500 })
    }
}

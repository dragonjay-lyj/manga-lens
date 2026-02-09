import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"

const supabaseAdmin = createServerClient()

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ outTradeNo: string }> }
) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { outTradeNo } = await params
        if (!outTradeNo) {
            return NextResponse.json({ error: "缺少订单号" }, { status: 400 })
        }

        const { data: transaction, error } = await supabaseAdmin
            .from("coin_transactions")
            .select("*")
            .eq("user_id", userId)
            .eq("out_trade_no", decodeURIComponent(outTradeNo))
            .eq("type", "recharge")
            .single()

        if (error || !transaction) {
            return NextResponse.json({ error: "订单不存在" }, { status: 404 })
        }

        return NextResponse.json({ transaction })
    } catch (error) {
        console.error("Get billing transaction detail error:", error)
        return NextResponse.json({ error: "获取订单详情失败" }, { status: 500 })
    }
}

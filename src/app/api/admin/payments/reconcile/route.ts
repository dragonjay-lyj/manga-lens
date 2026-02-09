import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/client"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getSystemSettings } from "@/lib/settings"
import { completeRechargeOrder } from "@/lib/payment/recharge"

const supabaseAdmin = createServerClient()

export async function POST(request: Request) {
    try {
        const admin = await requireAdmin()
        if (!admin.ok) return admin.response

        const body = await request.json()
        const outTradeNo = String(body?.outTradeNo || "").trim()
        if (!outTradeNo) {
            return NextResponse.json({ error: "缺少 outTradeNo" }, { status: 400 })
        }

        const { data: localOrder, error: localError } = await supabaseAdmin
            .from("coin_transactions")
            .select("*")
            .eq("out_trade_no", outTradeNo)
            .single()

        if (localError || !localOrder) {
            return NextResponse.json({ error: "订单不存在" }, { status: 404 })
        }

        if (localOrder.type !== "recharge") {
            return NextResponse.json({ error: "仅支持充值订单对账" }, { status: 400 })
        }

        if (localOrder.status === "completed") {
            return NextResponse.json({
                success: true,
                status: "already_completed",
                order: localOrder,
            })
        }

        const settings = await getSystemSettings(["linuxdo_credit_pid", "linuxdo_credit_key"])
        if (!settings.linuxdo_credit_pid || !settings.linuxdo_credit_key) {
            return NextResponse.json({ error: "支付配置不完整" }, { status: 400 })
        }

        const queryUrl = new URL("https://credit.linux.do/epay/api.php")
        queryUrl.searchParams.set("act", "order")
        queryUrl.searchParams.set("pid", settings.linuxdo_credit_pid)
        queryUrl.searchParams.set("key", settings.linuxdo_credit_key)
        queryUrl.searchParams.set("out_trade_no", outTradeNo)

        const remoteResponse = await fetch(queryUrl.toString())
        if (!remoteResponse.ok) {
            return NextResponse.json({ error: "远程查询失败" }, { status: 502 })
        }

        const remote = await remoteResponse.json()
        if (!(remote.code === 1 && remote.status === 1)) {
            return NextResponse.json({
                success: true,
                status: "pending",
                order: localOrder,
                remote,
            })
        }

        const remoteMoney = Number(remote.money)
        if (!Number.isFinite(remoteMoney) || remoteMoney <= 0 || !Number.isInteger(remoteMoney)) {
            return NextResponse.json({ error: "远程金额异常" }, { status: 409 })
        }

        const finalized = await completeRechargeOrder(supabaseAdmin, {
            outTradeNo,
            tradeNo: String(remote.trade_no || ""),
            paidAmount: remoteMoney,
        })

        if (!finalized.applied && finalized.status !== "already_completed") {
            return NextResponse.json(
                { error: `订单处理失败: ${finalized.message}`, status: finalized.status },
                { status: 409 }
            )
        }

        const { data: completedOrder } = await supabaseAdmin
            .from("coin_transactions")
            .select("*")
            .eq("out_trade_no", outTradeNo)
            .single()

        return NextResponse.json({
            success: true,
            status: "completed",
            order: completedOrder || { ...localOrder, status: "completed" },
            reconcile: finalized,
        })
    } catch (error) {
        console.error("Admin payment reconcile error:", error)
        return NextResponse.json({ error: "对账失败" }, { status: 500 })
    }
}

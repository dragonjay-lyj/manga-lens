// LINUX DO Credit 支付 - 订单查询
// 文档: https://credit.linux.do/docs/api

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"
import { getSystemSettings } from "@/lib/settings"
import { completeRechargeOrder } from "@/lib/payment/recharge"

const supabaseAdmin = createServerClient()

/**
 * 查询订单状态
 */
export async function GET(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const outTradeNo = searchParams.get("out_trade_no")

        if (!outTradeNo) {
            return NextResponse.json({ error: "缺少订单号" }, { status: 400 })
        }

        // 先查询本地数据库
        const { data: localOrder, error: localError } = await supabaseAdmin
            .from("coin_transactions")
            .select("*")
            .eq("out_trade_no", outTradeNo)
            .eq("user_id", userId)
            .single()

        if (localError || !localOrder) {
            return NextResponse.json({ error: "订单不存在" }, { status: 404 })
        }

        // 如果本地订单已完成，直接返回
        if (localOrder.status === "completed") {
            return NextResponse.json({
                success: true,
                status: "completed",
                order: localOrder,
            })
        }

        // 查询 LINUX DO Credit 平台
        const settings = await getSystemSettings([
            "linuxdo_credit_pid",
            "linuxdo_credit_key",
        ])

        if (!settings.linuxdo_credit_pid || !settings.linuxdo_credit_key) {
            // 未配置，跳过远程查询
            return NextResponse.json({
                success: true,
                status: "pending",
                order: localOrder,
            })
        }

        const queryUrl = new URL("https://credit.linux.do/epay/api.php")
        queryUrl.searchParams.set("act", "order")
        queryUrl.searchParams.set("pid", settings.linuxdo_credit_pid)
        queryUrl.searchParams.set("key", settings.linuxdo_credit_key)
        queryUrl.searchParams.set("out_trade_no", outTradeNo)

        const response = await fetch(queryUrl.toString())

        if (!response.ok) {
            // 订单可能还未认证
            return NextResponse.json({
                success: true,
                status: "pending",
                order: localOrder,
            })
        }

        const result = await response.json()

        if (result.code === 1 && result.status === 1) {
            const remoteMoney = Number(result.money)
            if (!Number.isFinite(remoteMoney) || remoteMoney <= 0 || !Number.isInteger(remoteMoney)) {
                return NextResponse.json(
                    { error: "远程订单金额异常" },
                    { status: 409 }
                )
            }

            const finalized = await completeRechargeOrder(supabaseAdmin, {
                outTradeNo,
                tradeNo: String(result.trade_no || ""),
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
                .eq("user_id", userId)
                .single()

            return NextResponse.json({
                success: true,
                status: "completed",
                order: completedOrder || { ...localOrder, status: "completed" },
            })
        }

        return NextResponse.json({
            success: true,
            status: localOrder.status,
            order: localOrder,
            remote: result,
        })
    } catch (error) {
        console.error("Query order error:", error)
        return NextResponse.json(
            { error: "查询订单失败" },
            { status: 500 }
        )
    }
}

// LINUX DO Credit 支付 - 异步回调通知
// 文档: https://credit.linux.do/docs/api

import { NextRequest } from "next/server"
import * as crypto from "crypto"
import { getSystemSettings } from "@/lib/settings"
import { createServerClient } from "@/lib/supabase/client"
import { completeRechargeOrder } from "@/lib/payment/recharge"

const supabaseAdmin = createServerClient()

/**
 * 验证签名
 */
function verifySign(params: Record<string, string>, secret: string): boolean {
    const receivedSign = params.sign
    if (!receivedSign) return false

    // 按签名算法重新计算
    const filteredParams = Object.entries(params)
        .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "")
        .sort(([a], [b]) => a.localeCompare(b))

    const queryString = filteredParams.map(([k, v]) => `${k}=${v}`).join("&")
    const signString = queryString + secret
    const calculatedSign = crypto.createHash("md5").update(signString).digest("hex").toLowerCase()

    return calculatedSign === receivedSign.toLowerCase()
}

/**
 * 异步通知回调 (GET)
 * 认证成功后平台会调用此接口
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const params: Record<string, string> = {}

        // 提取所有查询参数
        searchParams.forEach((value, key) => {
            params[key] = value
        })

        // 从数据库获取密钥与 pid
        const settings = await getSystemSettings(["linuxdo_credit_key", "linuxdo_credit_pid"])
        const linuxdoKey = settings.linuxdo_credit_key
        const linuxdoPid = settings.linuxdo_credit_pid
        if (!linuxdoKey || !linuxdoPid) {
            console.error("未配置 LINUX DO Credit 关键参数")
            return new Response("fail", { status: 500 })
        }

        if (params.pid !== linuxdoPid) {
            console.error("回调 pid 不匹配")
            return new Response("fail", { status: 400 })
        }

        // 验证签名
        if (!verifySign(params, linuxdoKey)) {
            console.error("签名验证失败")
            return new Response("fail", { status: 400 })
        }

        // 非成功交易直接确认，避免平台重复通知
        if (params.trade_status !== "TRADE_SUCCESS") {
            return new Response("success", { status: 200 })
        }

        const outTradeNo = params.out_trade_no?.trim()
        const tradeNo = params.trade_no?.trim() || ""
        const money = Number(params.money)

        if (!outTradeNo || !Number.isFinite(money) || money <= 0 || !Number.isInteger(money)) {
            console.error("无效的订单参数")
            return new Response("fail", { status: 400 })
        }

        const finalized = await completeRechargeOrder(supabaseAdmin, {
            outTradeNo,
            tradeNo,
            paidAmount: money,
        })

        if (finalized.applied || finalized.status === "already_completed") {
            return new Response("success", { status: 200 })
        }

        console.error("订单完成失败:", finalized)
        return new Response("fail", { status: 400 })
    } catch (error) {
        console.error("回调处理错误:", error)
        return new Response("fail", { status: 500 })
    }
}

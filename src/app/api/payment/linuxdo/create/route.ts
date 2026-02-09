// LINUX DO Credit 支付 - 创建订单
// 文档: https://credit.linux.do/docs/api

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createClient } from "@supabase/supabase-js"
import * as crypto from "crypto"
import { getLinuxdoPaymentConfigStatus, getSystemSettings } from "@/lib/settings"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 生成签名
 * 按"签名算法"：取非空字段，按ASCII升序拼接，末尾追加密钥，MD5小写
 */
function generateSign(params: Record<string, string>, secret: string): string {
    // 排除 sign 和 sign_type
    const filteredParams = Object.entries(params)
        .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "")
        .sort(([a], [b]) => a.localeCompare(b))

    // 拼接 k1=v1&k2=v2
    const queryString = filteredParams.map(([k, v]) => `${k}=${v}`).join("&")

    // 末尾追加密钥
    const signString = queryString + secret

    // MD5 小写
    return crypto.createHash("md5").update(signString).digest("hex").toLowerCase()
}

/**
 * 创建积分流转服务订单
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        await ensureUserRecord(userId)

        const body = await request.json()
        const { amount, name = "MangaLens 积分充值" } = body
        const amountNum = Number(amount)

        if (!Number.isInteger(amountNum) || amountNum <= 0) {
            return NextResponse.json({ error: "金额必须是正整数" }, { status: 400 })
        }
        const amountStr = amountNum.toString()

        // 生成订单号
        const outTradeNo = `ML${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`

        const configStatus = await getLinuxdoPaymentConfigStatus()
        if (!configStatus.enabled) {
            return NextResponse.json(
                {
                    error: "支付功能未启用，请联系管理员在 /admin/settings/payment 开启",
                    code: "PAYMENT_DISABLED",
                    configStatus,
                },
                { status: 400 }
            )
        }

        if (!configStatus.pidConfigured || !configStatus.keyConfigured) {
            return NextResponse.json(
                {
                    error: "支付配置不完整，请联系管理员在 /admin/settings/payment 填写 PID/KEY",
                    code: "PAYMENT_CONFIG_INCOMPLETE",
                    configStatus,
                },
                { status: 400 }
            )
        }

        // 从数据库获取 LINUX DO Credit 配置
        const settings = await getSystemSettings([
            "linuxdo_credit_pid",
            "linuxdo_credit_key",
            "linuxdo_credit_notify_url",
            "linuxdo_credit_return_url",
        ])

        // 构建请求参数
        const params: Record<string, string> = {
            pid: settings.linuxdo_credit_pid,
            type: "epay",
            out_trade_no: outTradeNo,
            name: String(name).slice(0, 64), // 最多64字符
            money: amountStr,
            notify_url: settings.linuxdo_credit_notify_url || "",
            return_url: settings.linuxdo_credit_return_url || "",
        }

        // 生成签名
        params.sign = generateSign(params, settings.linuxdo_credit_key)
        params.sign_type = "MD5"

        // 保存订单到数据库
        const { error: dbError } = await supabaseAdmin
            .from("coin_transactions")
            .insert({
                user_id: userId,
                type: "recharge",
                amount: amountNum,
                out_trade_no: outTradeNo,
                status: "pending",
                payment_method: "linuxdo_credit",
                created_at: new Date().toISOString(),
            })

        if (dbError) {
            console.error("Create order error:", dbError)
            return NextResponse.json({ error: "创建订单失败" }, { status: 500 })
        }

        // 构建提交URL
        const submitUrl = "https://credit.linux.do/epay/pay/submit.php"

        // 返回支付参数，前端可以用表单提交或跳转
        return NextResponse.json({
            success: true,
            submitUrl,
            params,
            outTradeNo,
        })
    } catch (error) {
        console.error("Create payment error:", error)
        return NextResponse.json(
            { error: "创建支付失败" },
            { status: 500 }
        )
    }
}

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"

// 使用 Service Role Key 绕过 RLS
const supabaseAdmin = createServerClient()

// 每次 AI 生成消耗的 Coin 数量
const COIN_COST_PER_GENERATION = 10

/**
 * 获取用户 Coin 余额
 */
export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { user, created } = await ensureUserRecord(userId)

        return NextResponse.json({
            coins: user.credits ?? 0,
            costPerGeneration: COIN_COST_PER_GENERATION,
            isNew: created,
        })
    } catch (error) {
        console.error("Coins GET error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

/**
 * 消费 Coin
 * POST body: { action: 'consume', amount?: number, reason?: string }
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { action, amount, reason } = body

        if (action !== "consume") {
            return NextResponse.json(
                { error: "Invalid action. Only 'consume' is allowed." },
                { status: 400 }
            )
        }

        const consumeAmount = amount === undefined ? COIN_COST_PER_GENERATION : Number(amount)
        if (!Number.isInteger(consumeAmount) || consumeAmount <= 0) {
            return NextResponse.json(
                { error: "amount 必须是正整数" },
                { status: 400 }
            )
        }

        const { user } = await ensureUserRecord(userId)
        const currentCredits = user.credits ?? 0

        // 检查余额是否足够
        if (currentCredits < consumeAmount) {
            return NextResponse.json({
                error: "余额不足",
                required: consumeAmount,
                current: currentCredits,
                insufficient: true,
            }, { status: 400 })
        }

        // 基于当前余额做乐观并发控制，避免并发请求导致余额覆盖
        const newCredits = currentCredits - consumeAmount
        const { data: updatedUser, error: updateError } = await supabaseAdmin
            .from("users")
            .update({ credits: newCredits })
            .eq("id", userId)
            .eq("credits", currentCredits)
            .select("credits")
            .single()

        if (updateError) {
            if (updateError.code === "PGRST116") {
                return NextResponse.json(
                    { error: "余额已变更，请重试" },
                    { status: 409 }
                )
            }
            console.error("Error updating credits:", updateError)
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        // 记录消费日志
        await supabaseAdmin.from("usage_logs").insert({
            user_id: userId,
            action: "coin_consume",
            credits_used: consumeAmount,
            metadata: { reason: reason || "AI 生成" },
        })

        return NextResponse.json({
            success: true,
            coins: updatedUser?.credits ?? newCredits,
            consumed: consumeAmount,
        })
    } catch (error) {
        console.error("Coins POST error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

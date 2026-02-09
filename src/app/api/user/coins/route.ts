import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

// 使用 Service Role Key 绕过 RLS
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

        // 获取用户余额
        const { data, error } = await supabaseAdmin
            .from("users")
            .select("credits")
            .eq("id", userId)
            .single()

        if (error) {
            // 用户不存在时返回默认余额
            if (error.code === "PGRST116") {
                return NextResponse.json({ coins: 100, isNew: true })
            }
            console.error("Error fetching coins:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            coins: data?.credits || 0,
            costPerGeneration: COIN_COST_PER_GENERATION,
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

        // 获取当前余额
        const { data: fetchedUser, error: fetchUserError } = await supabaseAdmin
            .from("users")
            .select("credits")
            .eq("id", userId)
            .single()

        let userData = fetchedUser

        // 如果用户不存在，创建用户记录
        if (fetchUserError?.code === "PGRST116") {
            const { data: newUser, error: createError } = await supabaseAdmin
                .from("users")
                .insert({ id: userId, credits: 100 })
                .select("credits")
                .single()

            if (createError) {
                console.error("Error creating user:", createError)
                return NextResponse.json({ error: createError.message }, { status: 500 })
            }
            userData = newUser
        } else if (fetchUserError) {
            console.error("Error fetching user:", fetchUserError)
            return NextResponse.json({ error: fetchUserError.message }, { status: 500 })
        }

        const currentCredits = userData?.credits || 0

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

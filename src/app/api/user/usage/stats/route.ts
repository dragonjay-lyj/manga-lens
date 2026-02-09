import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"

const USAGE_ACTIONS_FOR_PROCESS = ["coin_consume", "generate", "batch_generate"]

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, months: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatWeekday(date: Date): string {
    return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date)
}

function computeMonthChange(current: number, previous: number): number {
    if (previous === 0) {
        return current > 0 ? 100 : 0
    }
    return Math.round(((current - previous) / previous) * 100)
}

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { user } = await ensureUserRecord(userId)
        const supabaseAdmin = createServerClient()

        const now = new Date()
        const thisMonthStart = startOfMonth(now)
        const nextMonthStart = addMonths(now, 1)
        const previousMonthStart = addMonths(now, -1)

        const [
            thisMonthProcessedResult,
            previousMonthProcessedResult,
            thisMonthApiCallsResult,
            thisMonthCreditsRowsResult,
            projectsResult,
        ] = await Promise.all([
            supabaseAdmin
                .from("usage_logs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .in("action", USAGE_ACTIONS_FOR_PROCESS)
                .gte("created_at", thisMonthStart.toISOString())
                .lt("created_at", nextMonthStart.toISOString()),
            supabaseAdmin
                .from("usage_logs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .in("action", USAGE_ACTIONS_FOR_PROCESS)
                .gte("created_at", previousMonthStart.toISOString())
                .lt("created_at", thisMonthStart.toISOString()),
            supabaseAdmin
                .from("usage_logs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .gte("created_at", thisMonthStart.toISOString())
                .lt("created_at", nextMonthStart.toISOString()),
            supabaseAdmin
                .from("usage_logs")
                .select("credits_used")
                .eq("user_id", userId)
                .gte("created_at", thisMonthStart.toISOString())
                .lt("created_at", nextMonthStart.toISOString()),
            supabaseAdmin
                .from("projects")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId),
        ])

        const queryErrors = [
            thisMonthProcessedResult.error,
            previousMonthProcessedResult.error,
            thisMonthApiCallsResult.error,
            thisMonthCreditsRowsResult.error,
            projectsResult.error,
        ].filter(Boolean)

        if (queryErrors.length > 0) {
            console.error("Get usage stats query errors:", queryErrors)
            return NextResponse.json({ error: "获取使用统计失败" }, { status: 500 })
        }

        const processedThisMonth = thisMonthProcessedResult.count || 0
        const processedLastMonth = previousMonthProcessedResult.count || 0
        const apiCallsThisMonth = thisMonthApiCallsResult.count || 0
        const projectCount = projectsResult.count || 0

        const creditsUsedThisMonth = (thisMonthCreditsRowsResult.data || []).reduce((sum, row) => {
            const credits = Number(row.credits_used || 0)
            return sum + (Number.isFinite(credits) ? credits : 0)
        }, 0)

        const weeklyTrend: Array<{ label: string; count: number }> = []
        for (let i = 6; i >= 0; i--) {
            const day = new Date(now)
            day.setDate(now.getDate() - i)
            const dayStart = startOfDay(day)
            const nextDay = new Date(dayStart)
            nextDay.setDate(dayStart.getDate() + 1)

            const { count, error } = await supabaseAdmin
                .from("usage_logs")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .in("action", USAGE_ACTIONS_FOR_PROCESS)
                .gte("created_at", dayStart.toISOString())
                .lt("created_at", nextDay.toISOString())

            if (error) {
                console.error("Get weekly usage error:", error)
                weeklyTrend.push({ label: formatWeekday(day), count: 0 })
                continue
            }

            weeklyTrend.push({
                label: formatWeekday(day),
                count: count || 0,
            })
        }

        return NextResponse.json({
            summary: {
                credits: user.credits ?? 0,
                projectCount,
                processedThisMonth,
                processedLastMonth,
                monthChangePercent: computeMonthChange(processedThisMonth, processedLastMonth),
                apiCallsThisMonth,
                creditsUsedThisMonth,
            },
            weeklyTrend,
        })
    } catch (error) {
        console.error("Get usage stats error:", error)
        return NextResponse.json({ error: "获取使用统计失败" }, { status: 500 })
    }
}

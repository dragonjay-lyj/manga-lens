import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

// 创建 Supabase Admin 客户端
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
    try {
        const admin = await requireAdmin()
        if (!admin.ok) return admin.response

        // 获取统计数据
        const [usersResult, projectsResult, imagesResult, activeResult] = await Promise.all([
            // 总用户数
            supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
            // 总项目数
            supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }),
            // 总图片处理数（从 usage_logs 统计）
            supabaseAdmin.from('usage_logs').select('*', { count: 'exact', head: true }),
            // 活跃用户（最近 7 天有活动）
            supabaseAdmin
                .from('usage_logs')
                .select('user_id', { count: 'exact', head: true })
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        ])

        // 获取每周趋势（最近 7 天每天的使用量）
        const weeklyData = []
        for (let i = 6; i >= 0; i--) {
            const date = new Date()
            date.setDate(date.getDate() - i)
            const startOfDay = new Date(date.setHours(0, 0, 0, 0)).toISOString()
            const endOfDay = new Date(date.setHours(23, 59, 59, 999)).toISOString()

            const { count } = await supabaseAdmin
                .from('usage_logs')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfDay)
                .lte('created_at', endOfDay)

            weeklyData.push({
                date: new Date(date).toLocaleDateString('zh-CN', { weekday: 'short' }),
                count: count || 0,
            })
        }

        return NextResponse.json({
            stats: {
                totalUsers: usersResult.count || 0,
                activeUsers: activeResult.count || 0,
                totalProjects: projectsResult.count || 0,
                totalImages: imagesResult.count || 0,
            },
            weeklyTrend: weeklyData,
        })
    } catch (error) {
        console.error('Admin analytics API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

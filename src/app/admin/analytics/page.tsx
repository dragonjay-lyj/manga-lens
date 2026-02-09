"use client"

import { useState, useEffect } from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    BarChart3,
    TrendingUp,
    Image as ImageIcon,
    Zap,
    Calendar,
    RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminSkeleton } from "@/components/shared/skeleton-loaders"

interface AnalyticsData {
    stats: {
        totalUsers: number
        activeUsers: number
        totalProjects: number
        totalImages: number
    }
    weeklyTrend: {
        date: string
        count: number
    }[]
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/admin/analytics")
            if (!res.ok) throw new Error("获取数据失败")
            const json = await res.json()
            setData(json)
        } catch (err) {
            setError(err instanceof Error ? err.message : "未知错误")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    if (loading) {
        return <AdminSkeleton />
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-destructive">{error}</p>
                <Button onClick={fetchData}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重试
                </Button>
            </div>
        )
    }

    const stats = data?.stats || {
        totalUsers: 0,
        activeUsers: 0,
        totalProjects: 0,
        totalImages: 0,
    }

    const weeklyTrend = data?.weeklyTrend || []
    const maxCount = Math.max(...weeklyTrend.map(d => d.count), 1)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">使用统计</h1>
                    <p className="text-muted-foreground">
                        平台使用数据和趋势分析
                    </p>
                </div>
                <Button variant="outline" onClick={fetchData}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新
                </Button>
            </div>

            {/* 核心指标 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            总用户数
                        </CardTitle>
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats.totalUsers.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            注册用户总数
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            活跃用户
                        </CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats.activeUsers.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            <TrendingUp className="inline h-3 w-3 text-green-500" /> 最近 7 天活跃
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            项目总数
                        </CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats.totalProjects.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            用户创建的项目
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            图片处理数
                        </CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats.totalImages.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            AI 处理的图片总数
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* 每周趋势 */}
                <Card>
                    <CardHeader>
                        <CardTitle>每周处理趋势</CardTitle>
                        <CardDescription>
                            最近 7 天图片处理量
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {weeklyTrend.map((data) => (
                                <div key={data.date} className="flex items-center gap-4">
                                    <div className="w-10 text-sm text-muted-foreground">
                                        {data.date}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div
                                                className="h-2 rounded-full bg-primary"
                                                style={{
                                                    width: `${(data.count / maxCount) * 100}%`,
                                                    minWidth: data.count > 0 ? "8px" : "0",
                                                }}
                                            />
                                            <span className="text-xs text-muted-foreground">
                                                {data.count}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {weeklyTrend.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    暂无数据
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 快速统计 */}
                <Card>
                    <CardHeader>
                        <CardTitle>平台概览</CardTitle>
                        <CardDescription>
                            关键指标汇总
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm">用户活跃率</span>
                            <span className="font-medium">
                                {stats.totalUsers > 0
                                    ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)
                                    : 0}%
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">每项目平均图片</span>
                            <span className="font-medium">
                                {stats.totalProjects > 0
                                    ? (stats.totalImages / stats.totalProjects).toFixed(1)
                                    : 0}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">每用户平均项目</span>
                            <span className="font-medium">
                                {stats.totalUsers > 0
                                    ? (stats.totalProjects / stats.totalUsers).toFixed(1)
                                    : 0}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

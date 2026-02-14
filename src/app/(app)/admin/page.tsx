"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    Users,
    FolderKanban,
    ImageIcon,
    Activity,
    TrendingUp,
    TrendingDown,
    RefreshCw,
} from "lucide-react"
import { AdminSkeleton } from "@/components/shared/skeleton-loaders"

interface DashboardStats {
    totalUsers: number
    activeUsers: number
    totalProjects: number
    totalImages: number
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchStats = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/admin/analytics")
            if (!res.ok) throw new Error("获取数据失败")
            const data = await res.json()
            setStats(data.stats)
        } catch (err) {
            setError(err instanceof Error ? err.message : "未知错误")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStats()
    }, [])

    if (loading) {
        return <AdminSkeleton />
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-destructive">{error}</p>
                <Button onClick={fetchStats}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重试
                </Button>
            </div>
        )
    }

    const statsCards = [
        {
            title: "总用户数",
            value: stats?.totalUsers.toLocaleString() || "0",
            icon: Users,
            trend: "up",
            change: "+12%",
        },
        {
            title: "活跃用户",
            value: stats?.activeUsers.toLocaleString() || "0",
            icon: Activity,
            trend: "up",
            change: "+8%",
        },
        {
            title: "总项目数",
            value: stats?.totalProjects.toLocaleString() || "0",
            icon: FolderKanban,
            trend: "up",
            change: "+23%",
        },
        {
            title: "处理图片数",
            value: stats?.totalImages.toLocaleString() || "0",
            icon: ImageIcon,
            trend: "up",
            change: "+15%",
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">概览</h2>
                <Button variant="outline" size="sm" onClick={fetchStats}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新
                </Button>
            </div>

            {/* 统计卡片 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {statsCards.map((stat) => (
                    <Card key={stat.title} className="glass-card">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <div className="flex items-center gap-1 text-sm">
                                {stat.trend === "up" ? (
                                    <TrendingUp className="h-3 w-3 text-green-500" />
                                ) : (
                                    <TrendingDown className="h-3 w-3 text-red-500" />
                                )}
                                <span className={stat.trend === "up" ? "text-green-500" : "text-red-500"}>
                                    {stat.change}
                                </span>
                                <span className="text-muted-foreground">vs 上月</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* 快捷操作 */}
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>快捷操作</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                    <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                        <Users className="h-5 w-5" />
                        管理用户
                    </Button>
                    <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                        <FolderKanban className="h-5 w-5" />
                        查看项目
                    </Button>
                    <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                        <Activity className="h-5 w-5" />
                        使用统计
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}

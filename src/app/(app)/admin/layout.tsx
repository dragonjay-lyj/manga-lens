"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { ThemeSwitcher } from "@/components/shared/theme-switcher"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    LayoutDashboard,
    Users,
    BarChart3,
    Settings,
    CreditCard,
    Bot,
    Sparkles,
    Home,
    ChevronLeft,
    Loader2,
    ShieldAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"

const sidebarItems = [
    { href: "/admin", icon: LayoutDashboard, label: "仪表盘", labelEn: "Dashboard" },
    { href: "/admin/users", icon: Users, label: "用户管理", labelEn: "Users" },
    { href: "/admin/analytics", icon: BarChart3, label: "数据统计", labelEn: "Analytics" },
    { href: "/admin/payments", icon: CreditCard, label: "支付订单", labelEn: "Payments" },
    { href: "/admin/settings/ai", icon: Bot, label: "网站 API", labelEn: "Site API" },
    { href: "/admin/settings", icon: Settings, label: "系统设置", labelEn: "Settings" },
]

// 管理员邮箱白名单（可从环境变量或数据库获取）
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").filter(Boolean)

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { isLoaded, userId } = useAuth()
    const { user } = useUser()
    const pathname = usePathname()
    const router = useRouter()
    const [collapsed, setCollapsed] = useState(false)
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

    // 验证管理员权限
    useEffect(() => {
        const checkAdminStatus = async () => {
            if (!isLoaded || !userId) return

            // 检查用户邮箱是否在白名单中
            const userEmail = user?.primaryEmailAddress?.emailAddress
            if (ADMIN_EMAILS.length > 0 && userEmail && ADMIN_EMAILS.includes(userEmail)) {
                setIsAdmin(true)
                return
            }

            // 从数据库检查用户角色
            try {
                const res = await fetch("/api/user/role")
                if (res.ok) {
                    const data = await res.json()
                    setIsAdmin(data.role === "admin")
                } else {
                    setIsAdmin(false)
                }
            } catch {
                setIsAdmin(false)
            }
        }

        checkAdminStatus()
    }, [isLoaded, userId, user])

    // 未登录时重定向
    if (isLoaded && !userId) {
        router.push("/sign-in")
        return null
    }

    // 加载中
    if (!isLoaded || isAdmin === null) {
        return (
            <div className="h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // 非管理员访问被拒绝
    if (!isAdmin) {
        return (
            <div className="h-screen flex flex-col items-center justify-center gap-4">
                <ShieldAlert className="h-16 w-16 text-destructive" />
                <h1 className="text-2xl font-bold">访问被拒绝</h1>
                <p className="text-muted-foreground">您没有管理员权限访问此页面</p>
                <Button onClick={() => router.push("/")}>返回首页</Button>
            </div>
        )
    }

    const currentNav = sidebarItems.find((item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`)
    )

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-20 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 -right-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
            </div>

            <div className="h-screen p-3 sm:p-4">
                <div className="h-full flex rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl overflow-hidden">
                    {/* 侧边栏 */}
                    <aside
                        className={cn(
                            "border-r border-border glass-card transition-all duration-300 flex flex-col",
                            collapsed ? "w-16" : "w-64"
                        )}
                    >
                        <div className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
                            {!collapsed && (
                                <Link href="/admin" className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-md gradient-primary flex items-center justify-center">
                                        <Sparkles className="h-4 w-4 text-white" />
                                    </div>
                                    <span className="font-display font-bold">Admin</span>
                                </Link>
                            )}
                            <IconButton
                                variant="ghost"
                                ariaLabel={collapsed ? "展开侧边栏" : "收起侧边栏"}
                                onClick={() => setCollapsed(!collapsed)}
                            >
                                <ChevronLeft className={cn(
                                    "h-4 w-4 transition-transform",
                                    collapsed && "rotate-180"
                                )} />
                            </IconButton>
                        </div>

                        <ScrollArea className="flex-1 py-4">
                            <nav className="space-y-1 px-2">
                                {sidebarItems.map((item) => {
                                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                                                isActive
                                                    ? "bg-primary text-primary-foreground"
                                                    : "hover:bg-muted"
                                            )}
                                        >
                                            <item.icon className="h-5 w-5 flex-shrink-0" />
                                            {!collapsed && <span>{item.label}</span>}
                                        </Link>
                                    )
                                })}
                            </nav>
                        </ScrollArea>

                        <div className="border-t border-border p-4 flex-shrink-0">
                            <Link
                                href="/"
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors",
                                    collapsed ? "justify-center" : ""
                                )}
                            >
                                <Home className="h-5 w-5" />
                                {!collapsed && <span>返回首页</span>}
                            </Link>
                        </div>
                    </aside>

                    {/* 主内容 */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <header className="h-14 border-b border-border glass flex items-center justify-between px-6 flex-shrink-0">
                            <h1 className="font-display font-semibold text-lg">
                                {currentNav?.label || "Admin"}
                            </h1>
                            <div className="flex items-center gap-2">
                                <ThemeSwitcher locale="zh" />
                            </div>
                        </header>

                        <main id="main-content" className="flex-1 overflow-auto p-6">
                            {children}
                        </main>
                    </div>
                </div>
            </div>
        </div>
    )
}

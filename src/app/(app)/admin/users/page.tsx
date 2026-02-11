"use client"

import { useState, useEffect, useCallback } from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Users,
    Search,
    MoreHorizontal,
    UserCog,
    Trash2,
    Mail,
    Shield,
    ShieldCheck,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
} from "lucide-react"
import { AdminSkeleton } from "@/components/shared/skeleton-loaders"

interface User {
    id: string
    email: string
    username: string | null
    role: string
    credits: number
    created_at: string
    updated_at: string
}

interface Pagination {
    page: number
    limit: number
    total: number
    totalPages: number
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([])
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
    })
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [error, setError] = useState<string | null>(null)

    const fetchUsers = useCallback(async (page: number = 1, search: string = "") => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "20",
            })
            if (search) params.set("search", search)

            const res = await fetch(`/api/admin/users?${params}`)
            if (!res.ok) throw new Error("获取用户失败")

            const data = await res.json()
            setUsers(data.users || [])
            setPagination(data.pagination || {
                page,
                limit: 20,
                total: 0,
                totalPages: 0,
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : "未知错误")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const handleSearch = () => {
        fetchUsers(1, searchQuery)
    }

    const handlePageChange = (newPage: number) => {
        fetchUsers(newPage, searchQuery)
    }

    const getRoleBadge = (role: string) => {
        switch (role) {
            case "admin":
                return <Badge variant="destructive"><ShieldCheck className="h-3 w-3 mr-1" /> 管理员</Badge>
            case "premium":
                return <Badge className="bg-gradient-to-r from-amber-500 to-orange-500"><Shield className="h-3 w-3 mr-1" /> 高级</Badge>
            default:
                return <Badge variant="secondary">普通用户</Badge>
        }
    }

    if (loading && users.length === 0) {
        return <AdminSkeleton />
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">用户管理</h1>
                    <p className="text-muted-foreground">
                        管理和监控平台用户
                    </p>
                </div>
                <Button variant="outline" onClick={() => fetchUsers(pagination.page, searchQuery)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新
                </Button>
            </div>

            {/* 统计卡片 */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            总用户数
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pagination.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            管理员
                        </CardTitle>
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {users.filter((u) => u.role === "admin").length}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            高级用户
                        </CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {users.filter((u) => u.role === "premium").length}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            当前页
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {pagination.page} / {pagination.totalPages || 1}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 用户列表 */}
            <Card>
                <CardHeader>
                    <CardTitle>用户列表</CardTitle>
                    <CardDescription>
                        查看和管理所有注册用户
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索用户..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                className="pl-9"
                            />
                        </div>
                        <Button onClick={handleSearch}>搜索</Button>
                    </div>

                    {error ? (
                        <div className="text-center py-8 text-destructive">{error}</div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">暂无用户数据</div>
                    ) : (
                        <>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>用户</TableHead>
                                            <TableHead>角色</TableHead>
                                            <TableHead>积分</TableHead>
                                            <TableHead>注册日期</TableHead>
                                            <TableHead className="text-right">操作</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{user.username || "未设置"}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {user.email}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{getRoleBadge(user.role)}</TableCell>
                                                <TableCell>{user.credits}</TableCell>
                                                <TableCell>
                                                    {new Date(user.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-11 w-11"
                                                                aria-label={`用户操作菜单: ${user.username || user.email}`}
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>操作</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem>
                                                                <Mail className="mr-2 h-4 w-4" />
                                                                发送邮件
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem>
                                                                <UserCog className="mr-2 h-4 w-4" />
                                                                编辑角色
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-destructive">
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                删除用户
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* 分页 */}
                            {pagination.totalPages > 1 && (
                                <div className="flex items-center justify-end gap-2 mt-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(pagination.page - 1)}
                                        disabled={pagination.page <= 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                        第 {pagination.page} 页，共 {pagination.totalPages} 页
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(pagination.page + 1)}
                                        disabled={pagination.page >= pagination.totalPages}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

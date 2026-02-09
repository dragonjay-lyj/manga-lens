"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    CreditCard,
    Search,
    RefreshCw,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Clock,
    ShieldAlert,
    Settings2,
} from "lucide-react"
import { toast } from "sonner"

interface PaymentTransaction {
    id: string
    user_id: string
    amount: number
    out_trade_no: string
    trade_no: string | null
    status: "pending" | "completed" | "failed" | "refunded"
    payment_method: string
    created_at: string
    completed_at: string | null
}

interface Pagination {
    page: number
    limit: number
    total: number
    totalPages: number
}

interface UserProfile {
    id: string
    email: string | null
    username: string | null
}

interface PaymentsResponse {
    transactions: PaymentTransaction[]
    users: Record<string, UserProfile>
    configStatus: {
        enabled: boolean
        pidConfigured: boolean
        keyConfigured: boolean
        notifyUrlConfigured: boolean
        returnUrlConfigured: boolean
        isReady: boolean
    }
    timeoutMinutes: number
    pagination: Pagination
}

function statusBadge(status: string) {
    if (status === "completed") return <Badge className="bg-green-600">已完成</Badge>
    if (status === "pending") return <Badge variant="secondary">处理中</Badge>
    if (status === "failed") return <Badge variant="destructive">失败</Badge>
    return <Badge variant="outline">{status}</Badge>
}

export default function AdminPaymentsPage() {
    const [transactions, setTransactions] = useState<PaymentTransaction[]>([])
    const [users, setUsers] = useState<Record<string, UserProfile>>({})
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
    })
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState("all")
    const [onlyTimeout, setOnlyTimeout] = useState(false)
    const [timeoutMinutes, setTimeoutMinutes] = useState(30)
    const [reconcilingMap, setReconcilingMap] = useState<Record<string, boolean>>({})
    const [configStatus, setConfigStatus] = useState<PaymentsResponse["configStatus"]>({
        enabled: false,
        pidConfigured: false,
        keyConfigured: false,
        notifyUrlConfigured: false,
        returnUrlConfigured: false,
        isReady: false,
    })

    const fetchPayments = useCallback(async (page = 1) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(pagination.limit),
                status,
                search,
                only_timeout: onlyTimeout ? "true" : "false",
                timeout_minutes: String(timeoutMinutes),
            })

            const response = await fetch(`/api/admin/payments?${params}`)
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || "获取支付订单失败")
            }

            const data = (await response.json()) as PaymentsResponse
            setTransactions(data.transactions || [])
            setUsers(data.users || {})
            setConfigStatus(data.configStatus || {
                enabled: false,
                pidConfigured: false,
                keyConfigured: false,
                notifyUrlConfigured: false,
                returnUrlConfigured: false,
                isReady: false,
            })
            setTimeoutMinutes(data.timeoutMinutes || 30)
            setPagination(data.pagination || {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 1,
            })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "加载失败")
        } finally {
            setLoading(false)
        }
    }, [onlyTimeout, pagination.limit, search, status, timeoutMinutes])

    useEffect(() => {
        fetchPayments(1)
    }, [fetchPayments])

    const handleReconcile = async (outTradeNo: string) => {
        try {
            setReconcilingMap(prev => ({ ...prev, [outTradeNo]: true }))
            const response = await fetch("/api/admin/payments/reconcile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outTradeNo }),
            })

            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(data.error || "对账失败")
            }

            if (data.status === "completed" || data.status === "already_completed") {
                toast.success("对账完成")
            } else {
                toast.info("订单暂未完成")
            }

            await fetchPayments(pagination.page)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "对账失败")
        } finally {
            setReconcilingMap(prev => ({ ...prev, [outTradeNo]: false }))
        }
    }

    const timeoutCutoff = useMemo(
        () => Date.now() - timeoutMinutes * 60 * 1000,
        [timeoutMinutes]
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">支付订单</h1>
                    <p className="text-muted-foreground">查看充值订单并执行人工对账</p>
                </div>
                <Button variant="outline" className="h-11 px-4" onClick={() => fetchPayments(pagination.page)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        订单筛选
                    </CardTitle>
                    <CardDescription>可按状态、订单号、用户及超时条件筛选</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="search">搜索</Label>
                        <div className="flex gap-2">
                            <Input
                                id="search"
                                className="h-11"
                                placeholder="订单号 / 第三方单号 / 用户ID"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && fetchPayments(1)}
                            />
                            <Button className="h-11 px-4" onClick={() => fetchPayments(1)}>
                                <Search className="h-4 w-4 mr-2" />
                                搜索
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="payment-status">订单状态</Label>
                        <Select value={status} onValueChange={(value) => setStatus(value)}>
                            <SelectTrigger id="payment-status" className="h-11">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部</SelectItem>
                                <SelectItem value="pending">处理中</SelectItem>
                                <SelectItem value="completed">已完成</SelectItem>
                                <SelectItem value="failed">失败</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="payment-only-timeout" className="block">超时过滤</Label>
                        <div className="h-11 px-3 rounded-md border flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                仅看超时单
                            </div>
                            <Switch id="payment-only-timeout" checked={onlyTimeout} onCheckedChange={setOnlyTimeout} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>订单列表</CardTitle>
                    <CardDescription>共 {pagination.total} 条</CardDescription>
                </CardHeader>
                <CardContent>
                    {!loading && transactions.length === 0 && !configStatus.isReady && (
                        <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                                <ShieldAlert className="h-4 w-4" />
                                当前支付配置未就绪，充值订单不会创建
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground space-y-1">
                                {!configStatus.enabled ? <p>• 支付开关未启用</p> : null}
                                {!configStatus.pidConfigured ? <p>• Client ID (PID) 未配置</p> : null}
                                {!configStatus.keyConfigured ? <p>• Client Secret (KEY) 未配置</p> : null}
                            </div>
                            <Button variant="outline" size="sm" className="h-9 mt-3" asChild>
                                <Link href="/admin/settings/payment">
                                    <Settings2 className="h-4 w-4 mr-2" />
                                    前往支付设置
                                </Link>
                            </Button>
                        </div>
                    )}

                    {loading ? (
                        <div className="h-40 flex items-center justify-center text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            加载中
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="h-32 flex items-center justify-center text-muted-foreground">
                            暂无订单
                        </div>
                    ) : (
                        <>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>订单号</TableHead>
                                            <TableHead>用户</TableHead>
                                            <TableHead>金额</TableHead>
                                            <TableHead>状态</TableHead>
                                            <TableHead>创建时间</TableHead>
                                            <TableHead>完成时间</TableHead>
                                            <TableHead className="text-right">操作</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map((tx) => {
                                            const user = users[tx.user_id]
                                            const isPendingTimeout =
                                                tx.status === "pending" &&
                                                new Date(tx.created_at).getTime() < timeoutCutoff

                                            return (
                                                <TableRow key={tx.id}>
                                                    <TableCell className="font-mono text-xs">
                                                        <div>{tx.out_trade_no}</div>
                                                        {tx.trade_no && (
                                                            <div className="text-muted-foreground">{tx.trade_no}</div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="text-sm">{user?.username || "-"}</div>
                                                        <div className="text-xs text-muted-foreground">{user?.email || tx.user_id}</div>
                                                    </TableCell>
                                                    <TableCell>{tx.amount} Coins</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            {statusBadge(tx.status)}
                                                            {isPendingTimeout && <Badge variant="destructive">超时</Badge>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                                                    <TableCell>{tx.completed_at ? new Date(tx.completed_at).toLocaleString() : "-"}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-10"
                                                            disabled={tx.status === "completed" || reconcilingMap[tx.out_trade_no]}
                                                            onClick={() => handleReconcile(tx.out_trade_no)}
                                                        >
                                                            {reconcilingMap[tx.out_trade_no] ? (
                                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            ) : null}
                                                            对账
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-10"
                                    disabled={pagination.page <= 1}
                                    onClick={() => fetchPayments(pagination.page - 1)}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    第 {pagination.page} / {pagination.totalPages || 1} 页
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-10"
                                    disabled={pagination.page >= (pagination.totalPages || 1)}
                                    onClick={() => fetchPayments(pagination.page + 1)}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

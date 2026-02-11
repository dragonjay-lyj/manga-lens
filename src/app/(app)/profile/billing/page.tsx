"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Coins, Loader2, RefreshCw, Wallet } from "lucide-react"
import { toast } from "sonner"

interface Transaction {
    id: string
    amount: number
    out_trade_no: string
    trade_no: string | null
    status: "pending" | "completed" | "failed" | "refunded"
    created_at: string
    completed_at: string | null
}

interface BillingResponse {
    transactions: Transaction[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
    balance: number
    stats: {
        pending: number
        completed: number
        failed: number
    }
}

function statusBadge(status: Transaction["status"]) {
    if (status === "completed") return <Badge className="bg-green-600">已完成</Badge>
    if (status === "pending") return <Badge variant="secondary">处理中</Badge>
    if (status === "failed") return <Badge variant="destructive">失败</Badge>
    return <Badge variant="outline">{status}</Badge>
}

export default function BillingPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [balance, setBalance] = useState(0)
    const [stats, setStats] = useState({ pending: 0, completed: 0, failed: 0 })
    const [status, setStatus] = useState("all")
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
    })
    const [loading, setLoading] = useState(true)
    const [queryingMap, setQueryingMap] = useState<Record<string, boolean>>({})

    const fetchTransactions = useCallback(async (page = 1, statusFilter = status) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(pagination.limit),
                status: statusFilter,
            })
            const response = await fetch(`/api/user/billing/transactions?${params}`)
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || "加载失败")
            }

            const data = (await response.json()) as BillingResponse
            setTransactions(data.transactions || [])
            setBalance(data.balance || 0)
            setStats(data.stats || { pending: 0, completed: 0, failed: 0 })
            setPagination(data.pagination || {
                page: 1,
                limit: 10,
                total: 0,
                totalPages: 1,
            })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "加载失败")
        } finally {
            setLoading(false)
        }
    }, [pagination.limit, status])

    useEffect(() => {
        fetchTransactions(1, status)
    }, [fetchTransactions, status])

    const handleQueryOrder = async (outTradeNo: string) => {
        try {
            setQueryingMap(prev => ({ ...prev, [outTradeNo]: true }))
            const response = await fetch(`/api/payment/linuxdo/query?out_trade_no=${encodeURIComponent(outTradeNo)}`)
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(data.error || "查询失败")
            }

            if (data.status === "completed") {
                toast.success("订单已完成，余额已更新")
            } else {
                toast.info("订单仍在处理中")
            }
            await fetchTransactions(pagination.page, status)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "查询失败")
        } finally {
            setQueryingMap(prev => ({ ...prev, [outTradeNo]: false }))
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border glass-card">
                <div className="container mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <IconButton variant="ghost" ariaLabel="返回个人中心" asChild>
                            <Link href="/profile">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </IconButton>
                        <h1 className="font-semibold">充值与账单</h1>
                    </div>
                    <Button className="h-11 px-4" asChild>
                        <Link href="/profile/recharge">继续充值</Link>
                    </Button>
                </div>
            </header>

            <main id="main-content" className="container mx-auto px-4 py-8 space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">当前余额</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2 text-2xl font-bold text-amber-500">
                                <Wallet className="h-5 w-5" />
                                {balance}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Coins</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">处理中</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.pending}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">已完成</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.completed}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">失败</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.failed}</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Coins className="h-5 w-5 text-amber-500" />
                                充值订单
                            </CardTitle>
                            <CardDescription>查看充值历史与处理状态</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className="w-[140px] h-11">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">全部状态</SelectItem>
                                    <SelectItem value="pending">处理中</SelectItem>
                                    <SelectItem value="completed">已完成</SelectItem>
                                    <SelectItem value="failed">失败</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                className="h-11 px-4"
                                onClick={() => fetchTransactions(pagination.page, status)}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                刷新
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
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
                                                <TableHead>金额</TableHead>
                                                <TableHead>状态</TableHead>
                                                <TableHead>创建时间</TableHead>
                                                <TableHead>完成时间</TableHead>
                                                <TableHead className="text-right">操作</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {transactions.map((tx) => (
                                                <TableRow key={tx.id}>
                                                    <TableCell className="font-mono text-xs">
                                                        <Link
                                                            href={`/profile/billing/orders/${encodeURIComponent(tx.out_trade_no)}`}
                                                            className="underline-offset-4 hover:underline"
                                                        >
                                                            {tx.out_trade_no}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>{tx.amount} Coins</TableCell>
                                                    <TableCell>{statusBadge(tx.status)}</TableCell>
                                                    <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                                                    <TableCell>{tx.completed_at ? new Date(tx.completed_at).toLocaleString() : "-"}</TableCell>
                                                    <TableCell className="text-right">
                                                        {tx.status === "pending" ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-10"
                                                                onClick={() => handleQueryOrder(tx.out_trade_no)}
                                                                disabled={queryingMap[tx.out_trade_no]}
                                                            >
                                                                {queryingMap[tx.out_trade_no] && (
                                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                                )}
                                                                查询
                                                            </Button>
                                                        ) : (
                                                            <Button variant="ghost" size="sm" className="h-10" asChild>
                                                                <Link href={`/profile/billing/orders/${encodeURIComponent(tx.out_trade_no)}`}>
                                                                    查看
                                                                </Link>
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="mt-4 flex items-center justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-10"
                                        disabled={pagination.page <= 1}
                                        onClick={() => fetchTransactions(pagination.page - 1, status)}
                                    >
                                        上一页
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                        第 {pagination.page} / {pagination.totalPages || 1} 页
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-10"
                                        disabled={pagination.page >= (pagination.totalPages || 1)}
                                        onClick={() => fetchTransactions(pagination.page + 1, status)}
                                    >
                                        下一页
                                    </Button>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react"
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

function statusBadge(status: Transaction["status"]) {
    if (status === "completed") return <Badge className="bg-green-600">已完成</Badge>
    if (status === "pending") return <Badge variant="secondary">处理中</Badge>
    if (status === "failed") return <Badge variant="destructive">失败</Badge>
    return <Badge variant="outline">{status}</Badge>
}

export default function BillingOrderDetailPage() {
    const params = useParams<{ outTradeNo: string }>()
    const outTradeNo = useMemo(
        () => decodeURIComponent(params.outTradeNo || ""),
        [params.outTradeNo]
    )

    const [loading, setLoading] = useState(true)
    const [querying, setQuerying] = useState(false)
    const [transaction, setTransaction] = useState<Transaction | null>(null)

    const loadDetail = useCallback(async () => {
        if (!outTradeNo) return
        setLoading(true)
        try {
            const response = await fetch(`/api/user/billing/transactions/${encodeURIComponent(outTradeNo)}`)
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || "加载订单失败")
            }
            const data = await response.json()
            setTransaction(data.transaction || null)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "加载订单失败")
        } finally {
            setLoading(false)
        }
    }, [outTradeNo])

    useEffect(() => {
        loadDetail()
    }, [loadDetail])

    const handleQueryOrder = async () => {
        if (!transaction?.out_trade_no) return
        try {
            setQuerying(true)
            const response = await fetch(`/api/payment/linuxdo/query?out_trade_no=${encodeURIComponent(transaction.out_trade_no)}`)
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(data.error || "查询失败")
            }
            if (data.status === "completed") {
                toast.success("订单已完成，余额已更新")
            } else {
                toast.info("订单仍在处理中")
            }
            await loadDetail()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "查询失败")
        } finally {
            setQuerying(false)
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border glass-card">
                <div className="container mx-auto px-4 h-14 flex items-center gap-3">
                    <IconButton variant="ghost" ariaLabel="返回账单列表" asChild>
                        <Link href="/profile/billing">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </IconButton>
                    <h1 className="font-semibold">订单详情</h1>
                </div>
            </header>

            <main id="main-content" className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
                {loading ? (
                    <div className="h-48 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        加载中
                    </div>
                ) : !transaction ? (
                    <Card>
                        <CardContent className="h-32 flex items-center justify-center text-muted-foreground">
                            订单不存在
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span className="font-mono text-sm">{transaction.out_trade_no}</span>
                                    {statusBadge(transaction.status)}
                                </CardTitle>
                                <CardDescription>充值订单状态与支付信息</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <p className="text-muted-foreground">充值金额</p>
                                        <p className="text-xl font-semibold text-amber-500">{transaction.amount} Coins</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">第三方订单号</p>
                                        <p className="font-mono">{transaction.trade_no || "-"}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">创建时间</p>
                                        <p>{new Date(transaction.created_at).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">完成时间</p>
                                        <p>{transaction.completed_at ? new Date(transaction.completed_at).toLocaleString() : "-"}</p>
                                    </div>
                                </div>
                                {transaction.status === "pending" && (
                                    <Button className="h-11 px-4" onClick={handleQueryOrder} disabled={querying}>
                                        {querying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
                                        立即查询支付结果
                                    </Button>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>状态时间线</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                                    <div>
                                        <p className="font-medium">订单已创建</p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(transaction.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    {transaction.status === "completed" ? (
                                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                                    ) : transaction.status === "failed" ? (
                                        <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                                    ) : (
                                        <Clock className="h-5 w-5 text-amber-500 mt-0.5" />
                                    )}
                                    <div>
                                        <p className="font-medium">
                                            {transaction.status === "completed"
                                                ? "充值完成"
                                                : transaction.status === "failed"
                                                    ? "充值失败"
                                                    : "等待支付确认"}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {transaction.completed_at
                                                ? new Date(transaction.completed_at).toLocaleString()
                                                : "平台尚未回调成功"}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </main>
        </div>
    )
}

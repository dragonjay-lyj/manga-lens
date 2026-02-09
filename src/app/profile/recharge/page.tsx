"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Coins, ArrowLeft, ExternalLink, Loader2, CheckCircle, ShieldAlert, Settings2 } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

const PRESET_AMOUNTS = [10, 50, 100, 500, 1000]

interface PaymentConfigStatus {
    enabled: boolean
    pidConfigured: boolean
    keyConfigured: boolean
    notifyUrlConfigured: boolean
    returnUrlConfigured: boolean
    isReady: boolean
}

const DEFAULT_PAYMENT_CONFIG_STATUS: PaymentConfigStatus = {
    enabled: false,
    pidConfigured: false,
    keyConfigured: false,
    notifyUrlConfigured: false,
    returnUrlConfigured: false,
    isReady: false,
}

export default function RechargePage() {
    const router = useRouter()
    const [amount, setAmount] = useState<number>(100)
    const [customAmount, setCustomAmount] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [orderId, setOrderId] = useState<string>("")
    const [paymentConfigLoading, setPaymentConfigLoading] = useState(true)
    const [paymentConfigStatus, setPaymentConfigStatus] = useState<PaymentConfigStatus>(DEFAULT_PAYMENT_CONFIG_STATUS)

    const loadPaymentConfigStatus = useCallback(async () => {
        try {
            setPaymentConfigLoading(true)
            const response = await fetch("/api/payment/linuxdo/config", { cache: "no-store" })
            const data = await response.json().catch(() => ({}))

            if (!response.ok) {
                throw new Error(data.error || "获取支付配置失败")
            }

            setPaymentConfigStatus(data.configStatus || DEFAULT_PAYMENT_CONFIG_STATUS)
        } catch (error) {
            console.error("Load payment config status error:", error)
            setPaymentConfigStatus(DEFAULT_PAYMENT_CONFIG_STATUS)
        } finally {
            setPaymentConfigLoading(false)
        }
    }, [])

    useEffect(() => {
        loadPaymentConfigStatus()
    }, [loadPaymentConfigStatus])

    const paymentConfigIssues = useMemo(() => {
        const issues: string[] = []
        if (!paymentConfigStatus.enabled) {
            issues.push("支付开关未启用")
        }
        if (!paymentConfigStatus.pidConfigured) {
            issues.push("Client ID (PID) 未配置")
        }
        if (!paymentConfigStatus.keyConfigured) {
            issues.push("Client Secret (KEY) 未配置")
        }
        return issues
    }, [paymentConfigStatus.enabled, paymentConfigStatus.keyConfigured, paymentConfigStatus.pidConfigured])

    // 选择预设金额
    const handleSelectAmount = (value: number) => {
        setAmount(value)
        setCustomAmount("")
    }

    // 自定义金额
    const handleCustomAmount = (value: string) => {
        setCustomAmount(value)
        const num = parseInt(value, 10)
        if (!isNaN(num) && num > 0) {
            setAmount(num)
        }
    }

    // 创建订单并跳转支付
    const handleRecharge = async () => {
        if (amount <= 0) {
            toast.error("请输入有效金额")
            return
        }
        if (!paymentConfigStatus.isReady) {
            toast.error("支付暂不可用，请联系管理员完成支付配置")
            return
        }

        setLoading(true)

        try {
            const res = await fetch("/api/payment/linuxdo/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount,
                    name: `MangaLens 积分充值 ${amount} Coins`,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                if (data.code === "PAYMENT_DISABLED" || data.code === "PAYMENT_CONFIG_INCOMPLETE") {
                    await loadPaymentConfigStatus()
                }
                throw new Error(data.error || "创建订单失败")
            }

            setOrderId(data.outTradeNo)

            // 创建表单并提交到 LINUX DO Credit
            const form = document.createElement("form")
            form.method = "POST"
            form.action = data.submitUrl
            form.target = "_blank"

            Object.entries(data.params as Record<string, string>).forEach(([key, value]) => {
                const input = document.createElement("input")
                input.type = "hidden"
                input.name = key
                input.value = value
                form.appendChild(input)
            })

            document.body.appendChild(form)
            form.submit()
            document.body.removeChild(form)

            toast.success("订单已创建，请在新窗口完成支付")
        } catch (error) {
            const msg = error instanceof Error ? error.message : "充值失败"
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }

    // 查询订单状态
    const handleCheckOrder = async () => {
        if (!orderId) return

        try {
            const res = await fetch(`/api/payment/linuxdo/query?out_trade_no=${orderId}`)
            const data = await res.json()

            if (data.status === "completed") {
                toast.success("充值成功！")
                router.push("/profile")
            } else {
                toast.info("订单处理中，请稍后再试")
            }
        } catch {
            toast.error("查询失败")
        }
    }

    return (
        <div className="min-h-screen bg-background">
            {/* 顶部导航 */}
            <header className="border-b border-border glass-card">
                <div className="container mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <IconButton variant="ghost" ariaLabel="返回个人中心" asChild>
                            <Link href="/profile">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </IconButton>
                        <h1 className="font-semibold">积分充值</h1>
                    </div>
                    <Button variant="outline" className="h-10 px-4" asChild>
                        <Link href="/profile/billing">查看账单</Link>
                    </Button>
                </div>
            </header>

            <main id="main-content" className="container mx-auto px-4 py-8 max-w-lg">
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Coins className="h-5 w-5 text-amber-500" />
                            充值 Coins
                        </CardTitle>
                        <CardDescription>
                            使用 LINUX DO Credit 积分充值。1 Credit = 1 Coin
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {!paymentConfigLoading && !paymentConfigStatus.isReady && (
                            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                                    <ShieldAlert className="h-4 w-4" />
                                    <span className="text-sm font-medium">支付当前不可用</span>
                                    <Badge variant="outline">待配置</Badge>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1">
                                    {paymentConfigIssues.map((issue) => (
                                        <p key={issue}>• {issue}</p>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    管理员请前往 <span className="font-medium">/admin/settings/payment</span> 完成配置。
                                </p>
                            </div>
                        )}

                        {!paymentConfigLoading && paymentConfigStatus.isReady && (
                            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                                支付配置已就绪，可以正常创建充值订单。
                            </div>
                        )}

                        {/* 预设金额 */}
                        <div className="space-y-3">
                            <p className="text-sm font-medium">选择金额</p>
                            <div className="grid grid-cols-3 gap-2">
                                {PRESET_AMOUNTS.map((value) => (
                                    <Button
                                        key={value}
                                        variant={amount === value && !customAmount ? "default" : "outline"}
                                        onClick={() => handleSelectAmount(value)}
                                        className="h-12"
                                    >
                                        {value} Coins
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* 自定义金额 */}
                        <div className="space-y-2">
                            <Label htmlFor="custom-amount">或输入自定义金额</Label>
                            <Input
                                id="custom-amount"
                                type="number"
                                min="1"
                                step="1"
                                placeholder="输入金额 (最少 1)"
                                value={customAmount}
                                onChange={(e) => handleCustomAmount(e.target.value)}
                            />
                        </div>

                        {/* 当前选择 */}
                        <div className="p-4 rounded-lg bg-muted/50 text-center">
                            <p className="text-sm text-muted-foreground">充值金额</p>
                            <p className="text-3xl font-bold text-amber-500">{amount} Coins</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                消耗 {amount} LINUX DO Credit
                            </p>
                        </div>

                        {/* 充值按钮 */}
                        <Button
                            className="w-full h-12"
                            onClick={handleRecharge}
                            disabled={loading || amount <= 0 || paymentConfigLoading || !paymentConfigStatus.isReady}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    创建订单中...
                                </>
                            ) : paymentConfigLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    检查支付配置中...
                                </>
                            ) : !paymentConfigStatus.isReady ? (
                                <>
                                    <Settings2 className="h-4 w-4 mr-2" />
                                    支付配置未就绪
                                </>
                            ) : (
                                <>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    前往 LINUX DO Credit 支付
                                </>
                            )}
                        </Button>

                        {/* 订单查询 */}
                        {orderId && (
                            <div className="space-y-3 pt-4 border-t border-border">
                                <p className="text-sm text-muted-foreground text-center">
                                    订单号: {orderId}
                                </p>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={handleCheckOrder}
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    我已完成支付，查询结果
                                </Button>
                            </div>
                        )}

                        {/* 说明 */}
                        <div className="text-xs text-muted-foreground space-y-1">
                            <p>• 充值后 Coins 将立即到账</p>
                            <p>• 每次 AI 生成消耗 10 Coins</p>
                            <p>• 使用自己的 API Key 不消耗 Coins</p>
                            <p>• 如有问题请联系管理员</p>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}

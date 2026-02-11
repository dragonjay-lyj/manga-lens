"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Coins, ExternalLink, Loader2, RefreshCw, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/lib/stores/editor-store"

const PRESET_AMOUNTS = [10, 50, 100, 500, 1000]

type PaymentConfigStatus = {
    enabled: boolean
    pidConfigured: boolean
    keyConfigured: boolean
    notifyUrlConfigured: boolean
    returnUrlConfigured: boolean
    isReady: boolean
}

type CreateOrderResponse = {
    success: boolean
    submitUrl: string
    params: Record<string, string>
    outTradeNo: string
}

type RechargePanelProps = {
    embedded?: boolean
    className?: string
    onPaid?: () => void
}

const DEFAULT_CONFIG_STATUS: PaymentConfigStatus = {
    enabled: false,
    pidConfigured: false,
    keyConfigured: false,
    notifyUrlConfigured: false,
    returnUrlConfigured: false,
    isReady: false,
}

function openPaymentPage(submitUrl: string, params: Record<string, string>) {
    const form = document.createElement("form")
    form.method = "POST"
    form.action = submitUrl
    form.target = "_blank"

    for (const [key, value] of Object.entries(params)) {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = key
        input.value = value
        form.appendChild(input)
    }

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
}

export function RechargePanel({ embedded = false, className, onPaid }: RechargePanelProps) {
    const { locale } = useEditorStore()

    const [amount, setAmount] = useState(100)
    const [customAmount, setCustomAmount] = useState("")
    const [orderId, setOrderId] = useState("")

    const [creatingOrder, setCreatingOrder] = useState(false)
    const [queryingOrder, setQueryingOrder] = useState(false)
    const [loadingConfig, setLoadingConfig] = useState(true)
    const [configStatus, setConfigStatus] = useState<PaymentConfigStatus>(DEFAULT_CONFIG_STATUS)

    const loadConfigStatus = useCallback(async () => {
        setLoadingConfig(true)
        try {
            const res = await fetch("/api/payment/linuxdo/config", { cache: "no-store" })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data.error || "Failed to load payment config")
            }
            setConfigStatus(data.configStatus || DEFAULT_CONFIG_STATUS)
        } catch (error) {
            console.error("Failed to load payment config:", error)
            setConfigStatus(DEFAULT_CONFIG_STATUS)
        } finally {
            setLoadingConfig(false)
        }
    }, [])

    useEffect(() => {
        void loadConfigStatus()
    }, [loadConfigStatus])

    const configIssues = useMemo(() => {
        const issues: string[] = []
        if (!configStatus.enabled) {
            issues.push(locale === "zh" ? "支付功能未启用" : "Payment is disabled")
        }
        if (!configStatus.pidConfigured) {
            issues.push(locale === "zh" ? "PID 未配置" : "PID is missing")
        }
        if (!configStatus.keyConfigured) {
            issues.push(locale === "zh" ? "KEY 未配置" : "KEY is missing")
        }
        return issues
    }, [configStatus.enabled, configStatus.keyConfigured, configStatus.pidConfigured, locale])

    const handleSelectAmount = (value: number) => {
        setAmount(value)
        setCustomAmount("")
    }

    const handleCustomAmountChange = (value: string) => {
        setCustomAmount(value)
        const parsed = Number.parseInt(value, 10)
        if (Number.isInteger(parsed) && parsed > 0) {
            setAmount(parsed)
        }
    }

    const handleRecharge = async () => {
        if (!Number.isInteger(amount) || amount <= 0) {
            toast.error(locale === "zh" ? "请输入有效金额" : "Please enter a valid amount")
            return
        }

        if (!configStatus.isReady) {
            toast.error(locale === "zh" ? "支付配置未就绪" : "Payment config is not ready")
            return
        }

        setCreatingOrder(true)
        try {
            const res = await fetch("/api/payment/linuxdo/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount,
                    name: `MangaLens Recharge ${amount} Coins`,
                }),
            })

            const data = (await res.json().catch(() => ({}))) as Partial<CreateOrderResponse> & {
                error?: string
                code?: string
            }

            if (!res.ok || !data.submitUrl || !data.params || !data.outTradeNo) {
                if (data.code === "PAYMENT_DISABLED" || data.code === "PAYMENT_CONFIG_INCOMPLETE") {
                    await loadConfigStatus()
                }
                throw new Error(data.error || (locale === "zh" ? "创建订单失败" : "Failed to create order"))
            }

            setOrderId(data.outTradeNo)
            openPaymentPage(data.submitUrl, data.params)
            toast.success(locale === "zh" ? "订单创建成功，请在新窗口完成支付" : "Order created. Complete payment in the new window")
        } catch (error) {
            console.error("Create recharge order failed:", error)
            const message = error instanceof Error ? error.message : (locale === "zh" ? "创建订单失败" : "Failed to create order")
            toast.error(message)
        } finally {
            setCreatingOrder(false)
        }
    }

    const handleCheckOrder = async () => {
        if (!orderId) {
            toast.error(locale === "zh" ? "请先创建订单" : "Create an order first")
            return
        }

        setQueryingOrder(true)
        try {
            const url = `/api/payment/linuxdo/query?out_trade_no=${encodeURIComponent(orderId)}`
            const res = await fetch(url, { cache: "no-store" })
            const data = await res.json().catch(() => ({}))

            if (!res.ok) {
                throw new Error(data.error || (locale === "zh" ? "查询失败" : "Failed to query order"))
            }

            if (data.status === "completed") {
                toast.success(locale === "zh" ? "支付成功，Coins 已到账" : "Payment completed. Coins added")
                onPaid?.()
                return
            }

            toast.info(locale === "zh" ? "订单尚未完成支付" : "Order is still pending")
        } catch (error) {
            console.error("Check order failed:", error)
            const message = error instanceof Error ? error.message : (locale === "zh" ? "查询失败" : "Failed to query order")
            toast.error(message)
        } finally {
            setQueryingOrder(false)
        }
    }

    const content = (
        <>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <span className="text-sm text-muted-foreground">{locale === "zh" ? "支付配置状态" : "Payment status"}</span>
                {loadingConfig ? (
                    <Badge variant="secondary" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {locale === "zh" ? "检查中" : "Checking"}
                    </Badge>
                ) : configStatus.isReady ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">
                        {locale === "zh" ? "可用" : "Ready"}
                    </Badge>
                ) : (
                    <Badge variant="destructive">
                        {locale === "zh" ? "不可用" : "Not ready"}
                    </Badge>
                )}
            </div>

            {!loadingConfig && configIssues.length > 0 && (
                <div className="rounded-lg border border-amber-400/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
                    <div className="mb-1 flex items-center gap-1 font-medium">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {locale === "zh" ? "支付配置不完整" : "Payment config issues"}
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4">
                        {configIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{locale === "zh" ? "充值金额" : "Amount"}</p>
                <div className="grid grid-cols-3 gap-2">
                    {PRESET_AMOUNTS.map((value) => (
                        <Button
                            key={value}
                            type="button"
                            variant={amount === value && !customAmount ? "default" : "outline"}
                            onClick={() => handleSelectAmount(value)}
                        >
                            {value}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="recharge-custom-amount">{locale === "zh" ? "自定义金额" : "Custom amount"}</Label>
                <Input
                    id="recharge-custom-amount"
                    type="number"
                    min="1"
                    step="1"
                    value={customAmount}
                    onChange={(event) => handleCustomAmountChange(event.target.value)}
                    placeholder={locale === "zh" ? "输入充值金额（最小 1）" : "Enter amount (min 1)"}
                />
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">{locale === "zh" ? "当前充值" : "Current recharge"}</p>
                <p className="text-3xl font-bold text-amber-500">{amount} Coins</p>
                <p className="mt-1 text-xs text-muted-foreground">{amount} LINUX DO Credit</p>
            </div>

            <Button
                type="button"
                className="h-11 w-full"
                onClick={handleRecharge}
                disabled={creatingOrder || loadingConfig || !configStatus.isReady || amount <= 0}
            >
                {creatingOrder ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {locale === "zh" ? "创建订单中..." : "Creating order..."}
                    </>
                ) : (
                    <>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {locale === "zh" ? "前往支付" : "Proceed to payment"}
                    </>
                )}
            </Button>

            {orderId && (
                <div className="space-y-3 border-t border-border pt-4">
                    <p className="text-center text-xs text-muted-foreground">
                        {locale === "zh" ? "订单号" : "Order"}: {orderId}
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleCheckOrder}
                        disabled={queryingOrder}
                    >
                        {queryingOrder ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {locale === "zh" ? "查询中..." : "Checking..."}
                            </>
                        ) : (
                            <>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {locale === "zh" ? "我已支付，查询状态" : "I have paid, check status"}
                            </>
                        )}
                    </Button>
                </div>
            )}
        </>
    )

    if (embedded) {
        return <div className={cn("space-y-6", className)}>{content}</div>
    }

    return (
        <Card className={cn("glass-card", className)}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-amber-500" />
                    {locale === "zh" ? "充值 Coins" : "Recharge Coins"}
                </CardTitle>
                <CardDescription>
                    {locale === "zh"
                        ? "使用 LINUX DO Credit 充值。1 Credit = 1 Coin"
                        : "Recharge with LINUX DO Credit. 1 Credit = 1 Coin"}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">{content}</CardContent>
        </Card>
    )
}

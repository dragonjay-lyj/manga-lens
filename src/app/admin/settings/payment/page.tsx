"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, CreditCard, Eye, EyeOff, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface Setting {
    id: string
    key: string
    value: string
    description: string
    is_encrypted: boolean
    hasValue: boolean
    maskedPreview?: string
}

export default function PaymentSettingsPage() {
    const [settings, setSettings] = useState<Setting[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
    const [dirtyKeys, setDirtyKeys] = useState<Record<string, boolean>>({})

    // 加载设置
    const loadSettings = useCallback(async () => {
        try {
            setLoading(true)
            const res = await fetch("/api/admin/settings")
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || "加载失败")
            }

            // 只显示 LINUX DO Credit 相关设置
            const linuxdoSettings = data.settings.filter((s: Setting) =>
                s.key.startsWith("linuxdo_credit_")
            )
            setSettings(
                linuxdoSettings.map((setting: Setting) => (
                    setting.is_encrypted && setting.value === "******"
                        ? { ...setting, value: "" }
                        : setting
                ))
            )
            setDirtyKeys({})
        } catch (error) {
            const msg = error instanceof Error ? error.message : "加载失败"
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSettings()
    }, [loadSettings])

    // 更新单个设置
    const handleChange = (key: string, value: string) => {
        setSettings(prev =>
            prev.map(s => (s.key === key ? { ...s, value } : s))
        )
        setDirtyKeys((prev) => ({ ...prev, [key]: true }))
    }

    // 保存设置
    const handleSave = async () => {
        try {
            setSaving(true)

            const res = await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    settings: settings.map((s) => {
                        const trimmedValue = s.value.trim()
                        const keepEncryptedUnchanged =
                            s.is_encrypted &&
                            s.hasValue &&
                            !dirtyKeys[s.key] &&
                            trimmedValue === ""
                        return {
                            key: s.key,
                            value: keepEncryptedUnchanged ? "******" : trimmedValue,
                        }
                    })
                }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || "保存失败")
            }

            toast.success("设置已保存")
            loadSettings()
        } catch (error) {
            const msg = error instanceof Error ? error.message : "保存失败"
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }

    // 切换密钥显示
    const toggleShowSecret = (key: string) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }))
    }

    // 获取设置标签
    const getLabel = (key: string): string => {
        const labels: Record<string, string> = {
            linuxdo_credit_pid: "Client ID (PID)",
            linuxdo_credit_key: "Client Secret (密钥)",
            linuxdo_credit_notify_url: "回调地址 (Notify URL)",
            linuxdo_credit_return_url: "返回地址 (Return URL)",
            linuxdo_credit_enabled: "启用支付",
        }
        return labels[key] || key
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const enabledSetting = settings.find(s => s.key === "linuxdo_credit_enabled")
    const isEnabled = enabledSetting?.value === "true"

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">支付设置</h2>
                    <p className="text-muted-foreground">
                        配置 LINUX DO Credit 积分支付
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={loadSettings}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        刷新
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        保存设置
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            LINUX DO Credit
                        </CardTitle>
                        <CardDescription>
                            兼容 EasyPay / CodePay / VPay 协议
                        </CardDescription>
                    </div>
                    <Badge variant={isEnabled ? "default" : "secondary"}>
                        {isEnabled ? "已启用" : "未启用"}
                    </Badge>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* 启用开关 */}
                    {enabledSetting && (
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                            <div className="space-y-0.5">
                                <Label htmlFor="linuxdo-credit-enabled">启用 LINUX DO Credit 支付</Label>
                                <p className="text-sm text-muted-foreground">
                                    开启后用户可以使用 LINUX DO Credit 充值
                                </p>
                            </div>
                            <Switch
                                id="linuxdo-credit-enabled"
                                checked={enabledSetting.value === "true"}
                                onCheckedChange={(checked) =>
                                    handleChange("linuxdo_credit_enabled", checked ? "true" : "false")
                                }
                            />
                        </div>
                    )}

                    <Separator />

                    {/* 其他设置 */}
                    <div className="space-y-4">
                        {settings
                            .filter(s => s.key !== "linuxdo_credit_enabled")
                            .map((setting) => (
                                <div key={setting.key} className="space-y-2">
                                    <Label htmlFor={setting.key}>
                                        {getLabel(setting.key)}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id={setting.key}
                                            type={
                                                setting.is_encrypted && !showSecrets[setting.key]
                                                    ? "password"
                                                    : "text"
                                            }
                                            value={setting.value}
                                            onChange={(e) => handleChange(setting.key, e.target.value)}
                                            placeholder={
                                                setting.is_encrypted && setting.hasValue
                                                    ? "留空则保持原密钥不变，输入新值会覆盖"
                                                    : setting.description
                                            }
                                        />
                                        {setting.is_encrypted && (
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-11 w-11"
                                                aria-label={showSecrets[setting.key] ? `隐藏 ${getLabel(setting.key)}` : `显示 ${getLabel(setting.key)}`}
                                                onClick={() => toggleShowSecret(setting.key)}
                                            >
                                                {showSecrets[setting.key] ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                    {setting.description && (
                                        <p className="text-xs text-muted-foreground">
                                            {setting.description}
                                        </p>
                                    )}
                                    {setting.is_encrypted && setting.hasValue && !dirtyKeys[setting.key] && setting.maskedPreview && (
                                        <p className="text-xs text-muted-foreground">
                                            当前密钥：{setting.maskedPreview}
                                        </p>
                                    )}
                                </div>
                            ))}
                    </div>

                    <Separator />

                    {/* 说明 */}
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">配置说明：</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li>前往 <a href="https://credit.linux.do" target="_blank" rel="noopener noreferrer" className="text-primary underline">LINUX DO Credit</a> 创建应用</li>
                            <li>获取 Client ID 和 Client Secret</li>
                            <li>回调地址设置为：<code className="px-1 py-0.5 bg-muted rounded">/api/payment/linuxdo/notify</code></li>
                            <li>返回地址设置为充值完成后跳转的页面</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

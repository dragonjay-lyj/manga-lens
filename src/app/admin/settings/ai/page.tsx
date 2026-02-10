"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, Eye, EyeOff, Loader2, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface Setting {
    id: string
    key: string
    value: string
    description: string
    is_encrypted: boolean
    hasValue: boolean
    maskedPreview?: string
}

const AI_SETTING_KEYS = [
    "server_api_enabled",
    "server_api_provider",
    "server_api_key",
    "server_api_base_url",
    "server_api_model",
    "server_api_image_size",
]

export default function AdminAiSettingsPage() {
    const [settings, setSettings] = useState<Setting[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showSecret, setShowSecret] = useState(false)
    const [dirtyKeys, setDirtyKeys] = useState<Record<string, boolean>>({})

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true)
            const res = await fetch("/api/admin/settings")
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || "加载网站 API 设置失败")
            }
            const filtered = (data.settings as Setting[]).filter((item) =>
                AI_SETTING_KEYS.includes(item.key)
            )
            setSettings(
                filtered.map((item) => (
                    item.is_encrypted && item.value === "******"
                        ? { ...item, value: "" }
                        : item
                ))
            )
            setDirtyKeys({})
        } catch (error) {
            const message = error instanceof Error ? error.message : "加载失败"
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSettings()
    }, [loadSettings])

    const getSetting = useCallback((key: string) => settings.find((item) => item.key === key), [settings])
    const getValue = useCallback((key: string) => getSetting(key)?.value ?? "", [getSetting])

    const updateSetting = (key: string, value: string) => {
        setSettings((prev) =>
            prev.map((item) => (item.key === key ? { ...item, value } : item))
        )
        setDirtyKeys((prev) => ({ ...prev, [key]: true }))
    }

    const handleSave = async () => {
        try {
            setSaving(true)
            const payload = settings.map((item) => {
                const trimmedValue = item.value.trim()
                const keepEncryptedUnchanged =
                    item.is_encrypted &&
                    item.hasValue &&
                    !dirtyKeys[item.key] &&
                    trimmedValue === ""

                return {
                    key: item.key,
                    value: keepEncryptedUnchanged ? "******" : trimmedValue,
                }
            })
            const res = await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings: payload }),
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || "保存失败")
            }

            toast.success("网站 API 设置已保存")
            loadSettings()
        } catch (error) {
            const message = error instanceof Error ? error.message : "保存失败"
            toast.error(message)
        } finally {
            setSaving(false)
        }
    }

    const enabled = getValue("server_api_enabled") === "true"
    const provider = getValue("server_api_provider") === "openai" ? "openai" : "gemini"
    const modelValue = getValue("server_api_model")
    const imageSizeValue = (() => {
        const raw = getValue("server_api_image_size")
        if (raw === "1K" || raw === "4K") return raw
        return "2K"
    })()
    const keySetting = getSetting("server_api_key")

    const status = useMemo(() => {
        const hasKey = Boolean(keySetting?.hasValue || (keySetting?.value && keySetting.value !== "******"))
        return {
            hasKey,
            ready: enabled && hasKey,
        }
    }, [enabled, keySetting?.hasValue, keySetting?.value])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        网站 AI 设置
                    </h2>
                    <p className="text-muted-foreground">
                        配置后，付费用户可在编辑器使用“网站 API”模式。
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
                        <CardTitle>服务端 AI 连接</CardTitle>
                        <CardDescription>
                            该配置用于编辑器“使用网站 API”开关
                        </CardDescription>
                    </div>
                    <Badge variant={status.ready ? "default" : "secondary"}>
                        {status.ready ? "已就绪" : "未就绪"}
                    </Badge>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                        <div className="space-y-0.5">
                            <Label htmlFor="server-api-enabled">启用网站 API</Label>
                            <p className="text-sm text-muted-foreground">
                                关闭后，用户无法使用平台统一 API，只能用自有 Key
                            </p>
                        </div>
                        <Switch
                            id="server-api-enabled"
                            checked={enabled}
                            onCheckedChange={(checked) =>
                                updateSetting("server_api_enabled", checked ? "true" : "false")
                            }
                        />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <Label htmlFor="server-api-provider">Provider</Label>
                        <Select
                            value={provider}
                            onValueChange={(value: "gemini" | "openai") =>
                                updateSetting("server_api_provider", value)
                            }
                        >
                            <SelectTrigger id="server-api-provider">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gemini">Google Gemini</SelectItem>
                                <SelectItem value="openai">OpenAI / 兼容接口</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="server-api-key">API Key</Label>
                        <div className="flex gap-2">
                            <Input
                                id="server-api-key"
                                type={showSecret ? "text" : "password"}
                                value={keySetting?.value ?? ""}
                                onChange={(e) => updateSetting("server_api_key", e.target.value)}
                                placeholder={keySetting?.hasValue
                                    ? "留空则保持原密钥不变，输入新值会覆盖"
                                    : "输入网站统一 API Key"}
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-11 w-11"
                                aria-label={showSecret ? "隐藏 API Key" : "显示 API Key"}
                                onClick={() => setShowSecret((prev) => !prev)}
                            >
                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            已保存密钥不会回显明文。留空保存可保持原密钥不变。
                        </p>
                        {keySetting?.hasValue && !dirtyKeys.server_api_key && keySetting.maskedPreview && (
                            <p className="text-xs text-muted-foreground">
                                当前密钥：{keySetting.maskedPreview}
                            </p>
                        )}
                    </div>

                    {provider === "openai" && (
                        <div className="space-y-2">
                            <Label htmlFor="server-api-base-url">Base URL</Label>
                            <Input
                                id="server-api-base-url"
                                value={getValue("server_api_base_url")}
                                onChange={(e) => updateSetting("server_api_base_url", e.target.value)}
                                placeholder="https://api.openai.com/v1"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="server-api-model">模型</Label>
                        <Input
                            id="server-api-model"
                            value={modelValue}
                            onChange={(e) => updateSetting("server_api_model", e.target.value)}
                            placeholder={provider === "gemini" ? "gemini-2.5-flash-image" : "gpt-4o"}
                        />
                    </div>

                    {provider === "gemini" && (
                        <div className="space-y-2">
                            <Label htmlFor="server-api-image-size">生成分辨率</Label>
                            <Select
                                value={imageSizeValue}
                                onValueChange={(value: "1K" | "2K" | "4K") =>
                                    updateSetting("server_api_image_size", value)
                                }
                            >
                                <SelectTrigger id="server-api-image-size">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1K">1K（快）</SelectItem>
                                    <SelectItem value="2K">2K（平衡）</SelectItem>
                                    <SelectItem value="4K">4K（更清晰）</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                4K 清晰度更高，但耗时与成本会增加。
                            </p>
                        </div>
                    )}

                    <Separator />

                    <div className="text-sm text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">建议配置</p>
                        <p>1. Gemini 推荐模型：`gemini-2.5-flash-image`</p>
                        <p>2. OpenAI 兼容接口需填写 Base URL 与可图像处理模型</p>
                        <p>3. 建议先用测试账号打开编辑器并开启“使用网站 API”验证链路</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

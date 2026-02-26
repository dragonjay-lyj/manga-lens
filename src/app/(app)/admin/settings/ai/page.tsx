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
import {
    OPENAI_COMPATIBLE_PROVIDER_PRESETS,
    getOpenAICompatibleProviderPreset,
    guessOpenAICompatibleProviderPresetId,
} from "@/lib/ai/provider-presets"

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
    "comic_text_detector_enabled",
    "comic_text_detector_base_url",
    "comic_text_detector_api_key",
    "manga_ocr_enabled",
    "manga_ocr_base_url",
    "manga_ocr_api_key",
    "paddle_ocr_enabled",
    "paddle_ocr_base_url",
    "paddle_ocr_api_key",
    "baidu_ocr_enabled",
    "baidu_ocr_api_key",
    "baidu_ocr_secret_key",
    "baidu_ocr_base_url",
    "lama_inpaint_enabled",
    "lama_inpaint_base_url",
    "lama_inpaint_api_key",
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
    const openaiPresetId = useMemo(
        () => (provider === "openai" ? guessOpenAICompatibleProviderPresetId(getValue("server_api_base_url")) : "openai"),
        [getValue, provider]
    )
    const keySetting = getSetting("server_api_key")
    const comicDetectorEnabled = getValue("comic_text_detector_enabled") === "true"
    const comicDetectorBaseUrl = getValue("comic_text_detector_base_url")
    const comicDetectorKeySetting = getSetting("comic_text_detector_api_key")
    const mangaOcrEnabled = getValue("manga_ocr_enabled") === "true"
    const mangaOcrBaseUrl = getValue("manga_ocr_base_url")
    const mangaOcrKeySetting = getSetting("manga_ocr_api_key")
    const paddleOcrEnabled = getValue("paddle_ocr_enabled") === "true"
    const paddleOcrBaseUrl = getValue("paddle_ocr_base_url")
    const paddleOcrKeySetting = getSetting("paddle_ocr_api_key")
    const baiduOcrEnabled = getValue("baidu_ocr_enabled") === "true"
    const baiduOcrApiKeySetting = getSetting("baidu_ocr_api_key")
    const baiduOcrSecretSetting = getSetting("baidu_ocr_secret_key")
    const baiduOcrBaseUrl = getValue("baidu_ocr_base_url")
    const lamaInpaintEnabled = getValue("lama_inpaint_enabled") === "true"
    const lamaInpaintBaseUrl = getValue("lama_inpaint_base_url")
    const lamaInpaintKeySetting = getSetting("lama_inpaint_api_key")

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

                    {provider === "openai" ? (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="server-api-provider-preset">兼容服务商预设</Label>
                                <Select
                                    value={openaiPresetId}
                                    onValueChange={(value) => {
                                        if (value === "custom") return
                                        const preset = getOpenAICompatibleProviderPreset(value)
                                        if (!preset) return
                                        updateSetting("server_api_base_url", preset.baseUrl)
                                        if (!modelValue.trim()) {
                                            updateSetting("server_api_model", preset.modelHint)
                                        }
                                        toast.success(`已切换到 ${preset.label} 预设`)
                                    }}
                                >
                                    <SelectTrigger id="server-api-provider-preset">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OPENAI_COMPATIBLE_PROVIDER_PRESETS.map((preset) => (
                                            <SelectItem key={preset.id} value={preset.id}>
                                                {preset.label}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="custom">自定义</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    预设包含 OpenAI / SiliconFlow / DeepSeek / 火山引擎 / Ollama / Sakura。
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="server-api-base-url">Base URL</Label>
                                <Input
                                    id="server-api-base-url"
                                    value={getValue("server_api_base_url")}
                                    onChange={(e) => updateSetting("server_api_base_url", e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                />
                            </div>
                        </>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="server-api-base-url">Gemini Base URL（可选）</Label>
                            <Input
                                id="server-api-base-url"
                                value={getValue("server_api_base_url")}
                                onChange={(e) => updateSetting("server_api_base_url", e.target.value)}
                                placeholder="https://generativelanguage.googleapis.com"
                            />
                            <p className="text-xs text-muted-foreground">
                                支持填写 Gemini 官方格式中转站地址；留空默认走 Google 官方地址。
                            </p>
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
                        <p>1. Gemini 推荐模型：`gemini-2.5-flash-image` 或 `gemini-3-pro-image-preview`</p>
                        <p>2. OpenAI 兼容接口需填写 Base URL 与可图像处理模型</p>
                        <p>3. 建议先用测试账号打开编辑器并开启“使用网站 API”验证链路</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>comic-text-detector 文本框检测</CardTitle>
                        <CardDescription>
                            用于“自动检测文本并生成选区”，优先检测漫画文本框位置
                        </CardDescription>
                    </div>
                    <Badge variant={comicDetectorEnabled ? "default" : "secondary"}>
                        {comicDetectorEnabled ? "已启用" : "未启用"}
                    </Badge>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                        <div className="space-y-0.5">
                            <Label htmlFor="comic-detector-enabled">启用 comic-text-detector</Label>
                            <p className="text-sm text-muted-foreground">
                                启用后，文本检测接口会优先调用该服务
                            </p>
                        </div>
                        <Switch
                            id="comic-detector-enabled"
                            checked={comicDetectorEnabled}
                            onCheckedChange={(checked) =>
                                updateSetting("comic_text_detector_enabled", checked ? "true" : "false")
                            }
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="comic-detector-base-url">服务地址</Label>
                        <Input
                            id="comic-detector-base-url"
                            value={comicDetectorBaseUrl}
                            onChange={(e) => updateSetting("comic_text_detector_base_url", e.target.value)}
                            placeholder="http://127.0.0.1:5000"
                        />
                        <p className="text-xs text-muted-foreground">
                            支持 /detect、/api/detect、/predict 等常见推理端点
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="comic-detector-api-key">服务 API Key（可选）</Label>
                        <div className="flex gap-2">
                            <Input
                                id="comic-detector-api-key"
                                type={showSecret ? "text" : "password"}
                                value={comicDetectorKeySetting?.value ?? ""}
                                onChange={(e) => updateSetting("comic_text_detector_api_key", e.target.value)}
                                placeholder={comicDetectorKeySetting?.hasValue
                                    ? "留空则保持原密钥不变，输入新值会覆盖"
                                    : "无鉴权可留空"}
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
                        {comicDetectorKeySetting?.hasValue && !dirtyKeys.comic_text_detector_api_key && comicDetectorKeySetting.maskedPreview && (
                            <p className="text-xs text-muted-foreground">
                                当前密钥：{comicDetectorKeySetting.maskedPreview}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>OCR 适配层（MangaOCR / PaddleOCR / 百度 OCR）</CardTitle>
                    <CardDescription>
                        用于接入真实 OCR 后端。编辑器中可在 OCR 引擎下拉框切换对应通道。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3 rounded-lg border border-border/70 p-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="manga-ocr-enabled">启用 MangaOCR</Label>
                            <Switch
                                id="manga-ocr-enabled"
                                checked={mangaOcrEnabled}
                                onCheckedChange={(checked) =>
                                    updateSetting("manga_ocr_enabled", checked ? "true" : "false")
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="manga-ocr-base-url">MangaOCR 服务地址</Label>
                            <Input
                                id="manga-ocr-base-url"
                                value={mangaOcrBaseUrl}
                                onChange={(e) => updateSetting("manga_ocr_base_url", e.target.value)}
                                placeholder="http://127.0.0.1:8001"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="manga-ocr-api-key">MangaOCR API Key（可选）</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="manga-ocr-api-key"
                                    type={showSecret ? "text" : "password"}
                                    value={mangaOcrKeySetting?.value ?? ""}
                                    onChange={(e) => updateSetting("manga_ocr_api_key", e.target.value)}
                                    placeholder={mangaOcrKeySetting?.hasValue ? "留空则保持原值" : "无鉴权可留空"}
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
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/70 p-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="paddle-ocr-enabled">启用 PaddleOCR</Label>
                            <Switch
                                id="paddle-ocr-enabled"
                                checked={paddleOcrEnabled}
                                onCheckedChange={(checked) =>
                                    updateSetting("paddle_ocr_enabled", checked ? "true" : "false")
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="paddle-ocr-base-url">PaddleOCR 服务地址</Label>
                            <Input
                                id="paddle-ocr-base-url"
                                value={paddleOcrBaseUrl}
                                onChange={(e) => updateSetting("paddle_ocr_base_url", e.target.value)}
                                placeholder="http://127.0.0.1:8002"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="paddle-ocr-api-key">PaddleOCR API Key（可选）</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="paddle-ocr-api-key"
                                    type={showSecret ? "text" : "password"}
                                    value={paddleOcrKeySetting?.value ?? ""}
                                    onChange={(e) => updateSetting("paddle_ocr_api_key", e.target.value)}
                                    placeholder={paddleOcrKeySetting?.hasValue ? "留空则保持原值" : "无鉴权可留空"}
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
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/70 p-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="baidu-ocr-enabled">启用百度 OCR</Label>
                            <Switch
                                id="baidu-ocr-enabled"
                                checked={baiduOcrEnabled}
                                onCheckedChange={(checked) =>
                                    updateSetting("baidu_ocr_enabled", checked ? "true" : "false")
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="baidu-ocr-base-url">百度 OCR 接口地址</Label>
                            <Input
                                id="baidu-ocr-base-url"
                                value={baiduOcrBaseUrl}
                                onChange={(e) => updateSetting("baidu_ocr_base_url", e.target.value)}
                                placeholder="https://aip.baidubce.com/rest/2.0/ocr/v1/general"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="baidu-ocr-api-key">百度 OCR API Key</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="baidu-ocr-api-key"
                                    type={showSecret ? "text" : "password"}
                                    value={baiduOcrApiKeySetting?.value ?? ""}
                                    onChange={(e) => updateSetting("baidu_ocr_api_key", e.target.value)}
                                    placeholder={baiduOcrApiKeySetting?.hasValue ? "留空则保持原值" : "填写 API Key"}
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
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="baidu-ocr-secret-key">百度 OCR Secret Key</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="baidu-ocr-secret-key"
                                    type={showSecret ? "text" : "password"}
                                    value={baiduOcrSecretSetting?.value ?? ""}
                                    onChange={(e) => updateSetting("baidu_ocr_secret_key", e.target.value)}
                                    placeholder={baiduOcrSecretSetting?.hasValue ? "留空则保持原值" : "填写 Secret Key"}
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-11 w-11"
                                    aria-label={showSecret ? "隐藏 Secret Key" : "显示 Secret Key"}
                                    onClick={() => setShowSecret((prev) => !prev)}
                                >
                                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>LAMA 修复服务</CardTitle>
                        <CardDescription>
                            修补编辑器可切换到 LAMA 模式，按画笔 mask 做真实 inpaint。
                        </CardDescription>
                    </div>
                    <Badge variant={lamaInpaintEnabled ? "default" : "secondary"}>
                        {lamaInpaintEnabled ? "已启用" : "未启用"}
                    </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                        <div className="space-y-0.5">
                            <Label htmlFor="lama-inpaint-enabled">启用 LAMA 修复服务</Label>
                            <p className="text-sm text-muted-foreground">
                                启用后，编辑器“修补引擎”可选 LAMA。
                            </p>
                        </div>
                        <Switch
                            id="lama-inpaint-enabled"
                            checked={lamaInpaintEnabled}
                            onCheckedChange={(checked) =>
                                updateSetting("lama_inpaint_enabled", checked ? "true" : "false")
                            }
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="lama-inpaint-base-url">LAMA 服务地址</Label>
                        <Input
                            id="lama-inpaint-base-url"
                            value={lamaInpaintBaseUrl}
                            onChange={(e) => updateSetting("lama_inpaint_base_url", e.target.value)}
                            placeholder="http://127.0.0.1:8080"
                        />
                        <p className="text-xs text-muted-foreground">
                            支持 /inpaint、/api/inpaint、/predict 等端点。
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="lama-inpaint-api-key">LAMA API Key（可选）</Label>
                        <div className="flex gap-2">
                            <Input
                                id="lama-inpaint-api-key"
                                type={showSecret ? "text" : "password"}
                                value={lamaInpaintKeySetting?.value ?? ""}
                                onChange={(e) => updateSetting("lama_inpaint_api_key", e.target.value)}
                                placeholder={lamaInpaintKeySetting?.hasValue ? "留空则保持原值" : "无鉴权可留空"}
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
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

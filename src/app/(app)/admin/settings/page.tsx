"use client"

import { useState } from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Settings,
    Palette,
    Shield,
    Database,
    Save,
    Bot,
    CreditCard,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        siteName: "MangaLens",
        siteUrl: "https://manga-lens.com",
        defaultLocale: "zh-CN",
        defaultTheme: "dark",
        enableRegistration: true,
        enableGoogleAuth: true,
        maintenanceMode: false,
        maxUploadSize: 10,
        maxConcurrency: 3,
        defaultAIModel: "gemini-2.5-flash-image",
    })

    const handleSave = () => {
        toast.success("设置已保存")
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">系统设置</h1>
                    <p className="text-muted-foreground">
                        配置平台全局设置
                    </p>
                </div>
                <Button onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" />
                    保存设置
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>关键配置入口</CardTitle>
                    <CardDescription>
                        付费用户“使用网站 API”模式需要先完成网站 AI 配置
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                    <Button variant="outline" className="h-11 justify-start" asChild>
                        <Link href="/admin/settings/ai">
                            <Bot className="mr-2 h-4 w-4" />
                            网站 AI 设置（给付费用户）
                        </Link>
                    </Button>
                    <Button variant="outline" className="h-11 justify-start" asChild>
                        <Link href="/admin/settings/payment">
                            <CreditCard className="mr-2 h-4 w-4" />
                            支付设置（充值通道）
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Tabs defaultValue="general" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="general">
                        <Settings className="mr-2 h-4 w-4" />
                        常规
                    </TabsTrigger>
                    <TabsTrigger value="appearance">
                        <Palette className="mr-2 h-4 w-4" />
                        外观
                    </TabsTrigger>
                    <TabsTrigger value="security">
                        <Shield className="mr-2 h-4 w-4" />
                        安全
                    </TabsTrigger>
                    <TabsTrigger value="advanced">
                        <Database className="mr-2 h-4 w-4" />
                        高级
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>网站信息</CardTitle>
                            <CardDescription>
                                基本网站配置
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="siteName">网站名称</Label>
                                    <Input
                                        id="siteName"
                                        value={settings.siteName}
                                        onChange={(e) =>
                                            setSettings({ ...settings, siteName: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="siteUrl">网站 URL</Label>
                                    <Input
                                        id="siteUrl"
                                        value={settings.siteUrl}
                                        onChange={(e) =>
                                            setSettings({ ...settings, siteUrl: e.target.value })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="defaultLocale">默认语言</Label>
                                    <Select
                                        value={settings.defaultLocale}
                                        onValueChange={(value) =>
                                            setSettings({ ...settings, defaultLocale: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="zh-CN">简体中文</SelectItem>
                                            <SelectItem value="en">English</SelectItem>
                                            <SelectItem value="ja">日本語</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="defaultAIModel">默认 AI 模型</Label>
                                    <Select
                                        value={settings.defaultAIModel}
                                        onValueChange={(value) =>
                                            setSettings({ ...settings, defaultAIModel: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="gemini-2.0-flash">
                                                Gemini 2.5 Flash Image
                                            </SelectItem>
                                            <SelectItem value="gemini-2.5-flash">
                                                Gemini 2.5 Flash
                                            </SelectItem>
                                            <SelectItem value="gpt-4.1">
                                                GPT-4.1
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="appearance" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>外观设置</CardTitle>
                            <CardDescription>
                                自定义网站外观
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="defaultTheme">默认主题</Label>
                                <Select
                                    value={settings.defaultTheme}
                                    onValueChange={(value) =>
                                        setSettings({ ...settings, defaultTheme: value })
                                    }
                                >
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dark">Dark</SelectItem>
                                        <SelectItem value="light">Light</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>认证设置</CardTitle>
                            <CardDescription>
                                用户认证和注册配置
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="enable-registration">允许新用户注册</Label>
                                    <p className="text-sm text-muted-foreground">
                                        关闭后新用户将无法注册
                                    </p>
                                </div>
                                <Switch
                                    id="enable-registration"
                                    checked={settings.enableRegistration}
                                    onCheckedChange={(checked) =>
                                        setSettings({ ...settings, enableRegistration: checked })
                                    }
                                />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="enable-google-auth">Google 登录</Label>
                                    <p className="text-sm text-muted-foreground">
                                        允许使用 Google 账号登录
                                    </p>
                                </div>
                                <Switch
                                    id="enable-google-auth"
                                    checked={settings.enableGoogleAuth}
                                    onCheckedChange={(checked) =>
                                        setSettings({ ...settings, enableGoogleAuth: checked })
                                    }
                                />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="maintenance-mode">维护模式</Label>
                                    <p className="text-sm text-muted-foreground">
                                        开启后普通用户将无法访问
                                    </p>
                                </div>
                                <Switch
                                    id="maintenance-mode"
                                    checked={settings.maintenanceMode}
                                    onCheckedChange={(checked) =>
                                        setSettings({ ...settings, maintenanceMode: checked })
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>高级设置</CardTitle>
                            <CardDescription>
                                性能和限制配置
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="maxUploadSize">
                                        最大上传大小 (MB)
                                    </Label>
                                    <Input
                                        id="maxUploadSize"
                                        type="number"
                                        value={settings.maxUploadSize}
                                        onChange={(e) =>
                                            setSettings({
                                                ...settings,
                                                maxUploadSize: parseInt(e.target.value),
                                            })
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="maxConcurrency">
                                        最大并发数
                                    </Label>
                                    <Input
                                        id="maxConcurrency"
                                        type="number"
                                        value={settings.maxConcurrency}
                                        onChange={(e) =>
                                            setSettings({
                                                ...settings,
                                                maxConcurrency: parseInt(e.target.value),
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

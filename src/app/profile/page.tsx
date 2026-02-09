"use client"

import { useUser } from "@clerk/nextjs"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { User, Key, BarChart3, Shield, CreditCard } from "lucide-react"
import { AdminSkeleton } from "@/components/shared/skeleton-loaders"
import Link from "next/link"

export default function ProfilePage() {
    const { user, isLoaded } = useUser()

    if (!isLoaded) {
        return (
            <div className="container max-w-4xl py-8">
                <AdminSkeleton />
            </div>
        )
    }

    return (
        <main id="main-content" className="container max-w-4xl py-8 space-y-6">
            {/* 页头 */}
            <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                    {user?.imageUrl ? (
                        <Image
                            src={user.imageUrl}
                            alt="Avatar"
                            fill
                            unoptimized
                            sizes="64px"
                            className="object-cover"
                        />
                    ) : (
                        <User className="h-8 w-8 text-primary" />
                    )}
                </div>
                <div>
                    <h1 className="text-2xl font-bold">
                        {user?.fullName || user?.username || "用户"}
                    </h1>
                    <p className="text-muted-foreground">
                        {user?.primaryEmailAddress?.emailAddress}
                    </p>
                </div>
            </div>

            <Tabs defaultValue="profile" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="profile">
                        <User className="h-4 w-4 mr-2" />
                        个人资料
                    </TabsTrigger>
                    <TabsTrigger value="api">
                        <Key className="h-4 w-4 mr-2" />
                        API 配置
                    </TabsTrigger>
                    <TabsTrigger value="usage">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        使用统计
                    </TabsTrigger>
                </TabsList>

                {/* 个人资料 */}
                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>个人资料</CardTitle>
                            <CardDescription>管理您的账户信息</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="profile-username">用户名</Label>
                                    <Input id="profile-username" value={user?.username || ""} disabled />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="profile-email">邮箱</Label>
                                    <Input
                                        id="profile-email"
                                        value={user?.primaryEmailAddress?.emailAddress || ""}
                                        disabled
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                    <Shield className="h-3 w-3 mr-1" />
                                    免费版
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                    注册于 {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
                                </span>
                            </div>
                            <Separator />
                            <div className="flex justify-between gap-2">
                                <Button variant="outline" asChild>
                                    <Link href="/profile/billing">
                                        <CreditCard className="h-4 w-4 mr-2" />
                                        账单中心
                                    </Link>
                                </Button>
                                <Button variant="outline" onClick={() => window.open("/user-profile", "_blank")}>
                                    在 Clerk 中编辑
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* API 配置 */}
                <TabsContent value="api">
                    <Card>
                        <CardHeader>
                            <CardTitle>API 配置</CardTitle>
                            <CardDescription>
                                配置您的 AI API 密钥用于图片处理
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="gemini-api-key">Gemini API Key</Label>
                                <Input id="gemini-api-key" type="password" placeholder="AIza..." />
                                <p className="text-xs text-muted-foreground">
                                    从 Google AI Studio 获取您的 API Key
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                                <Input id="openai-api-key" type="password" placeholder="sk-..." />
                                <p className="text-xs text-muted-foreground">
                                    从 OpenAI Platform 获取您的 API Key
                                </p>
                            </div>
                            <Separator />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline">重置</Button>
                                <Button>保存配置</Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 使用统计 */}
                <TabsContent value="usage">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    本月处理
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">128 张</div>
                                <p className="text-xs text-muted-foreground">
                                    +12% 较上月
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    API 调用
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">256 次</div>
                                <p className="text-xs text-muted-foreground">
                                    平均每张 2 次
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    项目数
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">5 个</div>
                                <p className="text-xs text-muted-foreground">
                                    活跃项目
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="mt-4">
                        <CardHeader>
                            <CardTitle>使用历史</CardTitle>
                            <CardDescription>最近 7 天的处理记录</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-32 flex items-end justify-between gap-2">
                                {[12, 24, 8, 32, 18, 28, 16].map((value, i) => (
                                    <div
                                        key={i}
                                        className="flex-1 bg-primary/20 rounded-t"
                                        style={{ height: `${value * 3}px` }}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground mt-2">
                                <span>周一</span>
                                <span>周二</span>
                                <span>周三</span>
                                <span>周四</span>
                                <span>周五</span>
                                <span>周六</span>
                                <span>周日</span>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </main>
    )
}

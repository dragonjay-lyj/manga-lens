import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Zap, Crown, Building2 } from "lucide-react"
import Link from "next/link"
import { SiteShell } from "@/components/shared/site-shell"

const plans = [
    {
        name: "免费版",
        price: "¥0",
        period: "/月",
        description: "适合个人试用",
        icon: Zap,
        features: [
            "每月 100 次 AI 调用",
            "单张图片处理",
            "基础导出格式",
            "社区支持",
        ],
        buttonText: "开始使用",
        buttonVariant: "outline" as const,
        href: "/editor",
    },
    {
        name: "专业版",
        price: "¥49",
        period: "/月",
        description: "适合频繁使用的创作者",
        icon: Crown,
        popular: true,
        features: [
            "每月 2000 次 AI 调用",
            "批量图片处理",
            "所有导出格式",
            "优先客服支持",
            "项目云存储",
            "历史版本回溯",
        ],
        buttonText: "升级专业版",
        buttonVariant: "default" as const,
        href: "/checkout?plan=pro",
    },
    {
        name: "企业版",
        price: "联系我们",
        period: "",
        description: "适合团队和企业",
        icon: Building2,
        features: [
            "无限 AI 调用",
            "API 接入权限",
            "团队协作功能",
            "专属客户经理",
            "SLA 保障",
            "私有化部署",
        ],
        buttonText: "联系销售",
        buttonVariant: "outline" as const,
        href: "mailto:sales@mangalens.app",
    },
]

export default function PricingPage() {
    return (
        <SiteShell contentClassName="max-w-6xl">
            <div className="container max-w-6xl py-16 space-y-12">
                {/* 页头 */}
                <div className="text-center space-y-4">
                    <Badge variant="secondary" className="mb-4">
                        灵活定价
                    </Badge>
                    <h1 className="text-4xl font-bold tracking-tight">
                        选择适合您的方案
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        无论是个人创作者还是企业团队，我们都有适合您的方案
                    </p>
                </div>

                {/* 价格卡片 */}
                <div className="grid gap-6 md:grid-cols-3">
                    {plans.map((plan) => (
                        <Card
                            key={plan.name}
                            className={`relative ${plan.popular
                                    ? "border-primary shadow-lg scale-105"
                                    : ""
                                }`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <Badge className="bg-primary">最受欢迎</Badge>
                                </div>
                            )}
                            <CardHeader className="text-center pb-4">
                                <div className="w-12 h-12 mx-auto rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                                    <plan.icon className="h-6 w-6 text-primary" />
                                </div>
                                <CardTitle className="text-xl">{plan.name}</CardTitle>
                                <CardDescription>{plan.description}</CardDescription>
                                <div className="mt-4">
                                    <span className="text-4xl font-bold">{plan.price}</span>
                                    <span className="text-muted-foreground">{plan.period}</span>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <ul className="space-y-2">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-center gap-2">
                                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                            <span className="text-sm">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    variant={plan.buttonVariant}
                                    className="w-full"
                                    asChild
                                >
                                    <Link href={plan.href}>{plan.buttonText}</Link>
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* FAQ */}
                <div className="text-center space-y-4">
                    <h2 className="text-2xl font-bold">常见问题</h2>
                    <div className="grid gap-4 md:grid-cols-2 text-left max-w-3xl mx-auto">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    可以随时取消订阅吗？
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                是的，您可以随时取消订阅，剩余时间会按比例退款。
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    免费版有什么限制？
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                免费版每月有 100 次 AI 调用限制，且只能逐张处理图片。
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    支持哪些支付方式？
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                支持支付宝、微信支付和国际信用卡。
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    企业版有什么特殊权益？
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                企业版支持私有化部署、API 接入和专属技术支持。
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </SiteShell>
    )
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import {
    BookOpen,
    Zap,
    Wand2,
    HelpCircle,
    ExternalLink,
    Keyboard,
} from "lucide-react"
import Link from "next/link"
import { SiteShell } from "@/components/shared/site-shell"

const shortcuts = [
    { keys: ["Ctrl", "Z"], action: "撤销" },
    { keys: ["Ctrl", "Shift", "Z"], action: "重做" },
    { keys: ["Ctrl", "Y"], action: "重做" },
    { keys: ["Delete"], action: "删除选区/图片" },
    { keys: ["+"], action: "放大" },
    { keys: ["-"], action: "缩小" },
    { keys: ["0"], action: "重置视图" },
    { keys: ["Space"], action: "切换原图/结果" },
    { keys: ["Ctrl", "Enter"], action: "生成" },
    { keys: ["Ctrl", "V"], action: "粘贴图片" },
]

const faqs = [
    {
        question: "如何获取 Gemini API Key？",
        answer: "访问 Google AI Studio (aistudio.google.com)，登录 Google 账户后点击 'Get API Key' 即可免费获取。免费额度对于个人使用通常足够。",
    },
    {
        question: "支持哪些图片格式？",
        answer: "支持常见的图片格式：PNG、JPG、JPEG、WebP、GIF。上传时会自动转换为适合 AI 处理的格式。",
    },
    {
        question: "如何批量处理多张图片？",
        answer: "上传多张图片后，在右侧选中需要处理的图片，然后点击工具栏的'批量生成所有'按钮。可以设置并发数来控制同时处理的图片数量。",
    },
    {
        question: "选区位置不准确怎么办？",
        answer: "使用缩放功能放大图片后再绘制选区，可以获得更精确的选区位置。使用 + 和 - 键快速缩放。",
    },
    {
        question: "AI 生成结果不符合预期？",
        answer: "尝试优化提示词，使用更具体的描述。例如，改为'请用简体中文翻译图中的日文对话，保持字体风格一致，不要改变其他区域'。",
    },
    {
        question: "处理速度很慢怎么办？",
        answer: "检查网络连接，或尝试使用更小的选区。批量处理时可以降低并发数来减少 API 压力。",
    },
    {
        question: "支持自动检测漫画文本框吗？",
        answer: "支持。可在编辑器侧边栏点击“自动检测文本并生成选区”。若管理员在 /admin/settings/ai 启用了 comic-text-detector，会优先使用该检测服务。",
    },
]

export default function DocsPage() {
    return (
        <SiteShell contentClassName="max-w-4xl">
            <div className="container max-w-4xl py-8 space-y-8">
                {/* 页头 */}
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold">帮助文档</h1>
                    <p className="text-muted-foreground max-w-lg mx-auto">
                        了解如何使用 MangaLens 进行 AI 图像局部重绘
                    </p>
                </div>

                {/* 快速开始 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            快速开始
                        </CardTitle>
                        <CardDescription>3 步完成第一次 AI 重绘</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Badge>步骤 1</Badge>
                                <h3 className="font-medium">上传图片</h3>
                                <p className="text-sm text-muted-foreground">
                                    点击上传或直接拖拽图片到编辑器。支持批量上传。
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Badge>步骤 2</Badge>
                                <h3 className="font-medium">框选区域</h3>
                                <p className="text-sm text-muted-foreground">
                                    在画布上拖动鼠标框选需要修改的区域。
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Badge>步骤 3</Badge>
                                <h3 className="font-medium">输入提示词并生成</h3>
                                <p className="text-sm text-muted-foreground">
                                    描述您想要的效果，点击生成按钮。
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-center">
                            <Button asChild>
                                <Link href="/editor">
                                    <Wand2 className="h-4 w-4 mr-2" />
                                    立即体验
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 键盘快捷键 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Keyboard className="h-5 w-5 text-primary" />
                            键盘快捷键
                        </CardTitle>
                        <CardDescription>提高您的工作效率</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-2 md:grid-cols-2">
                            {shortcuts.map((shortcut, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                                >
                                    <span className="text-sm">{shortcut.action}</span>
                                    <div className="flex items-center gap-1">
                                        {shortcut.keys.map((key, j) => (
                                            <kbd
                                                key={j}
                                                className="px-2 py-1 bg-background border rounded text-xs font-mono"
                                            >
                                                {key}
                                            </kbd>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* 常见问题 */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <HelpCircle className="h-5 w-5 text-primary" />
                            常见问题
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="single" collapsible className="w-full">
                            {faqs.map((faq, i) => (
                                <AccordionItem key={i} value={`item-${i}`}>
                                    <AccordionTrigger>{faq.question}</AccordionTrigger>
                                    <AccordionContent className="text-muted-foreground">
                                        {faq.answer}
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </CardContent>
                </Card>

                {/* 外部链接 */}
                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">API 文档</CardTitle>
                            <CardDescription>开发者集成指南</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full" asChild>
                                <Link href="/api-docs">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    查看 API 文档
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">联系我们</CardTitle>
                            <CardDescription>反馈问题或建议</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full" asChild>
                                <a href="mailto:lyjcody@foxmail.com">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    发送邮件
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </SiteShell>
    )
}

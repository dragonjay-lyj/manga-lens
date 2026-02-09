import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home, ArrowLeft, Search } from "lucide-react"

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <div className="text-center space-y-8 max-w-md">
                {/* 404 动画数字 */}
                <div className="relative">
                    <h1 className="text-[150px] font-bold leading-none gradient-text opacity-20 select-none">
                        404
                    </h1>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                            <Search className="h-12 w-12 text-primary" />
                        </div>
                    </div>
                </div>

                {/* 文字说明 */}
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold">页面未找到</h2>
                    <p className="text-muted-foreground">
                        抱歉，您访问的页面不存在或已被移动。
                    </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button asChild>
                        <Link href="/">
                            <Home className="h-4 w-4 mr-2" />
                            返回首页
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/editor">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            打开编辑器
                        </Link>
                    </Button>
                </div>

                {/* 装饰元素 */}
                <div className="flex justify-center gap-1">
                    {[...Array(5)].map((_, i) => (
                        <div
                            key={i}
                            className="w-2 h-2 rounded-full bg-primary/30"
                            style={{
                                animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

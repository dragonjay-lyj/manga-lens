"use client"

import { Component, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import Link from "next/link"

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

/**
 * 错误边界组件 - 捕获子组件中的运行时错误
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo)
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null })
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }

            return (
                <div className="min-h-[400px] flex items-center justify-center p-8">
                    <div className="text-center space-y-6 max-w-md">
                        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                            <AlertTriangle className="h-8 w-8 text-destructive" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold">出现了一些问题</h2>
                            <p className="text-muted-foreground text-sm">
                                应用程序遇到了意外错误。您可以尝试刷新页面或返回首页。
                            </p>
                        </div>
                        {this.state.error && (
                            <div className="bg-muted rounded-lg p-3 text-left">
                                <p className="text-xs font-mono text-muted-foreground break-all">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}
                        <div className="flex items-center justify-center gap-3">
                            <Button onClick={this.handleRetry} variant="default">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                重试
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/">
                                    <Home className="h-4 w-4 mr-2" />
                                    返回首页
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Code, FileJson, Key, Zap, Shield, ArrowRight } from "lucide-react"

const endpoints = [
    {
        method: "POST",
        path: "/api/generate",
        description: "AI 图片生成接口",
        auth: true,
        body: {
            imageData: "base64 编码的图片数据",
            prompt: "生成提示词",
            provider: "gemini | openai",
            model: "模型名称（可选）",
        },
        response: {
            success: "boolean",
            imageData: "base64 编码的结果图片",
            error: "错误信息（失败时）",
        },
    },
    {
        method: "GET",
        path: "/api/projects",
        description: "获取用户项目列表",
        auth: true,
        query: {
            page: "页码（默认 1）",
            limit: "每页数量（默认 20）",
        },
        response: {
            projects: "项目数组",
            pagination: "分页信息",
        },
    },
    {
        method: "POST",
        path: "/api/projects",
        description: "创建新项目",
        auth: true,
        body: {
            name: "项目名称",
            description: "项目描述（可选）",
        },
        response: {
            project: "创建的项目对象",
        },
    },
    {
        method: "GET",
        path: "/api/user/api-keys",
        description: "获取用户 API Key 列表（掩码）",
        auth: true,
        response: {
            keys: "API Key 列表（带掩码）",
        },
    },
    {
        method: "POST",
        path: "/api/user/api-keys",
        description: "保存 API Key",
        auth: true,
        body: {
            provider: "gemini | openai | custom",
            apiKey: "API Key 值",
        },
        response: {
            success: "boolean",
        },
    },
]

const codeExamples = {
    generate: `fetch('/api/generate', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        imageData: 'data:image/png;base64,...',
        prompt: '将图中的日文翻译为中文',
        provider: 'gemini',
        model: 'gemini-2.5-flash-preview-05-20'
    })
})`,
    projects: `fetch('/api/projects?page=1&limit=10', {
    method: 'GET',
})`,
}

export default function ApiDocsPage() {
    return (
        <div className="container max-w-4xl py-8 space-y-8">
            {/* 页头 */}
            <div className="space-y-2">
                <Badge variant="secondary" className="mb-2">
                    <Code className="h-3 w-3 mr-1" />
                    开发者文档
                </Badge>
                <h1 className="text-4xl font-bold tracking-tight">API 文档</h1>
                <p className="text-lg text-muted-foreground">
                    MangaLens API 接口说明和使用示例
                </p>
            </div>

            <Separator />

            {/* 认证说明 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        认证方式
                    </CardTitle>
                    <CardDescription>
                        所有 API 请求需要通过 Clerk 认证
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        API 使用 Cookie 进行身份验证。请确保在浏览器中使用已登录的会话，
                        或在服务端使用 Clerk SDK 进行认证。
                    </p>
                    <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                        <p className="text-muted-foreground"># 认证头示例（服务端使用）</p>
                        <p>Authorization: Bearer {'<your-session-token>'}</p>
                    </div>
                </CardContent>
            </Card>

            {/* API 端点列表 */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    API 端点
                </h2>

                {endpoints.map((endpoint, index) => (
                    <Card key={index}>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Badge
                                    variant={endpoint.method === "GET" ? "secondary" : "default"}
                                    className="font-mono"
                                >
                                    {endpoint.method}
                                </Badge>
                                <code className="font-mono text-lg">{endpoint.path}</code>
                                {endpoint.auth && (
                                    <Badge variant="outline">
                                        <Key className="h-3 w-3 mr-1" />
                                        需认证
                                    </Badge>
                                )}
                            </div>
                            <CardDescription>{endpoint.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {endpoint.query && (
                                <div>
                                    <h4 className="font-medium mb-2">查询参数</h4>
                                    <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
                                        {Object.entries(endpoint.query).map(([key, value]) => (
                                            <p key={key}>
                                                <span className="text-primary">{key}</span>: {value}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {endpoint.body && (
                                <div>
                                    <h4 className="font-medium mb-2">请求体</h4>
                                    <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
                                        {Object.entries(endpoint.body).map(([key, value]) => (
                                            <p key={key}>
                                                <span className="text-primary">{key}</span>: {value}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <h4 className="font-medium mb-2">响应</h4>
                                <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
                                    {Object.entries(endpoint.response).map(([key, value]) => (
                                        <p key={key}>
                                            <span className="text-green-600">{key}</span>: {value}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* 代码示例 */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <FileJson className="h-5 w-5" />
                    代码示例
                </h2>

                <Card>
                    <CardHeader>
                        <CardTitle>图片生成请求</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-lg overflow-x-auto text-sm">
                            <code>{codeExamples.generate}</code>
                        </pre>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>获取项目列表</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-lg overflow-x-auto text-sm">
                            <code>{codeExamples.projects}</code>
                        </pre>
                    </CardContent>
                </Card>
            </div>

            {/* 错误处理 */}
            <Card>
                <CardHeader>
                    <CardTitle>错误响应</CardTitle>
                    <CardDescription>API 错误返回格式</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                        <p>{"{"}</p>
                        <p className="pl-4">&quot;error&quot;: &quot;错误描述信息&quot;</p>
                        <p>{"}"}</p>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                        <p><Badge variant="destructive">401</Badge> 未认证或认证失败</p>
                        <p><Badge variant="destructive">400</Badge> 请求参数错误</p>
                        <p><Badge variant="destructive">500</Badge> 服务器内部错误</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

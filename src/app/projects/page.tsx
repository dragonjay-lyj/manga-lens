"use client"

import { useState, useEffect, useCallback } from "react"
import { useUser } from "@clerk/nextjs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Plus,
    FolderOpen,
    Search,
    Clock,
    Image as ImageIcon,
    Trash2,
    Edit,
    RefreshCw,
    Loader2,
} from "lucide-react"
import Link from "next/link"
import { AdminSkeleton } from "@/components/shared/skeleton-loaders"
import { EmptyState } from "@/components/shared/empty-state"

interface Project {
    id: string
    name: string
    description: string | null
    imageCount: number
    createdAt: string
    updatedAt: string
}

interface Pagination {
    page: number
    limit: number
    total: number
    totalPages: number
}

export default function ProjectsPage() {
    const { isLoaded } = useUser()
    const [projects, setProjects] = useState<Project[]>([])
    const [pagination, setPagination] = useState<Pagination | null>(null)
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [error, setError] = useState<string | null>(null)

    // 新建项目对话框
    const [newProjectOpen, setNewProjectOpen] = useState(false)
    const [newProjectName, setNewProjectName] = useState("")
    const [newProjectDescription, setNewProjectDescription] = useState("")
    const [creating, setCreating] = useState(false)
    const [editProjectOpen, setEditProjectOpen] = useState(false)
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
    const [editProjectName, setEditProjectName] = useState("")
    const [editProjectDescription, setEditProjectDescription] = useState("")
    const [updating, setUpdating] = useState(false)

    const fetchProjects = useCallback(async (page: number = 1) => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams({ page: page.toString(), limit: "20" })
            const res = await fetch(`/api/projects?${params}`)
            if (!res.ok) throw new Error("获取项目失败")
            const data = await res.json()
            setProjects(data.projects || [])
            setPagination(data.pagination || null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "未知错误")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (isLoaded) {
            fetchProjects()
        }
    }, [isLoaded, fetchProjects])

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return

        setCreating(true)
        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newProjectName,
                    description: newProjectDescription || null,
                }),
            })
            if (!res.ok) throw new Error("创建项目失败")

            setNewProjectOpen(false)
            setNewProjectName("")
            setNewProjectDescription("")
            fetchProjects()
        } catch (err) {
            console.error(err)
        } finally {
            setCreating(false)
        }
    }

    const handleDeleteProject = async (id: string) => {
        if (!confirm("确定要删除此项目吗？")) return

        try {
            const res = await fetch(`/api/projects/${id}`, { method: "DELETE" })
            if (!res.ok) throw new Error("删除失败")
            fetchProjects()
        } catch (err) {
            console.error(err)
        }
    }

    const openEditProject = (project: Project) => {
        setEditingProjectId(project.id)
        setEditProjectName(project.name)
        setEditProjectDescription(project.description || "")
        setEditProjectOpen(true)
    }

    const handleUpdateProject = async () => {
        if (!editingProjectId || !editProjectName.trim()) return
        setUpdating(true)
        try {
            const res = await fetch(`/api/projects/${editingProjectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editProjectName.trim(),
                    description: editProjectDescription || null,
                }),
            })
            if (!res.ok) throw new Error("更新项目失败")
            setEditProjectOpen(false)
            setEditingProjectId(null)
            fetchProjects(pagination?.page || 1)
        } catch (err) {
            console.error(err)
        } finally {
            setUpdating(false)
        }
    }

    const filteredProjects = projects.filter(
        (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (!isLoaded || loading) {
        return (
            <div className="container max-w-6xl py-8">
                <AdminSkeleton />
            </div>
        )
    }

    return (
        <div className="container max-w-6xl py-8 space-y-6">
            {/* 页头 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">我的项目</h1>
                    <p className="text-muted-foreground">管理您的图片处理项目</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => fetchProjects()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                新建项目
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>新建项目</DialogTitle>
                                <DialogDescription>
                                    创建一个新的图片处理项目
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">项目名称</Label>
                                    <Input
                                        id="name"
                                        value={newProjectName}
                                        onChange={(e) => setNewProjectName(e.target.value)}
                                        placeholder="输入项目名称"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">描述（可选）</Label>
                                    <Textarea
                                        id="description"
                                        value={newProjectDescription}
                                        onChange={(e) => setNewProjectDescription(e.target.value)}
                                        placeholder="输入项目描述"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setNewProjectOpen(false)}>
                                    取消
                                </Button>
                                <Button onClick={handleCreateProject} disabled={creating || !newProjectName.trim()}>
                                    {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    创建
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>编辑项目</DialogTitle>
                                <DialogDescription>
                                    更新项目名称和描述
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-name">项目名称</Label>
                                    <Input
                                        id="edit-name"
                                        value={editProjectName}
                                        onChange={(e) => setEditProjectName(e.target.value)}
                                        placeholder="输入项目名称"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-description">描述（可选）</Label>
                                    <Textarea
                                        id="edit-description"
                                        value={editProjectDescription}
                                        onChange={(e) => setEditProjectDescription(e.target.value)}
                                        placeholder="输入项目描述"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setEditProjectOpen(false)}>
                                    取消
                                </Button>
                                <Button onClick={handleUpdateProject} disabled={updating || !editProjectName.trim()}>
                                    {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    保存
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* 搜索和筛选 */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索项目..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                {pagination && (
                    <span className="text-sm text-muted-foreground">
                        共 {pagination.total} 个项目
                    </span>
                )}
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="text-center py-8 text-destructive">{error}</div>
            )}

            {/* 项目列表 */}
            {filteredProjects.length === 0 ? (
                <EmptyState
                    icon={FolderOpen}
                    title="暂无项目"
                    description="创建您的第一个项目开始使用"
                    action={
                        <Button onClick={() => setNewProjectOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            创建项目
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredProjects.map((project) => (
                        <Card key={project.id} className="group hover:border-primary/50 transition-colors">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-lg">{project.name}</CardTitle>
                                        <CardDescription className="line-clamp-2">
                                            {project.description || "无描述"}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-11 w-11"
                                            aria-label={`编辑项目: ${project.name}`}
                                            onClick={() => openEditProject(project)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-11 w-11 text-destructive"
                                            aria-label={`删除项目: ${project.name}`}
                                            onClick={() => handleDeleteProject(project.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between text-sm text-muted-foreground">
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1">
                                            <ImageIcon className="h-4 w-4" />
                                            {project.imageCount} 张
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-4 w-4" />
                                            {new Date(project.updatedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/editor?project=${project.id}`}>打开</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

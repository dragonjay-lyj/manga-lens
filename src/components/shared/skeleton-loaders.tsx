"use client"

import { Skeleton } from "@/components/ui/skeleton"

/**
 * 编辑器页面骨架屏
 */
export function EditorSkeleton() {
    return (
        <div className="h-screen flex flex-col bg-background overflow-hidden">
            {/* 顶部工具栏骨架 */}
            <div className="h-14 border-b border-border flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-8 w-48" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-32" />
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* 左侧边栏骨架 */}
                <div className="w-80 border-r border-border p-4 space-y-6">
                    <div className="space-y-3">
                        <Skeleton className="h-4 w-20" />
                        <div className="flex gap-2">
                            <Skeleton className="h-9 flex-1" />
                            <Skeleton className="h-9 flex-1" />
                        </div>
                        <Skeleton className="h-9 w-full" />
                    </div>

                    <div className="space-y-3">
                        <Skeleton className="h-4 w-24" />
                        <div className="grid grid-cols-3 gap-2">
                            {[...Array(6)].map((_, i) => (
                                <Skeleton key={i} className="aspect-square" />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                </div>

                {/* 中间画布骨架 */}
                <div className="flex-1 flex items-center justify-center bg-muted/30">
                    <Skeleton className="w-3/4 aspect-video rounded-lg" />
                </div>

                {/* 右侧面板骨架 */}
                <div className="w-64 border-l border-border p-4 space-y-4">
                    <Skeleton className="h-4 w-20" />
                    <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

/**
 * Admin 页面骨架屏
 */
export function AdminSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-64" />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-4" />
                        </div>
                        <Skeleton className="h-8 w-16" />
                    </div>
                ))}
            </div>

            <div className="border rounded-lg p-4 space-y-4">
                <Skeleton className="h-6 w-32" />
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * 卡片骨架屏
 */
export function CardSkeleton() {
    return (
        <div className="border rounded-lg p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
        </div>
    )
}

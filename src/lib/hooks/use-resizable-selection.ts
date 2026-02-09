"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { Selection } from "@/types/database"

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | null

interface UseResizableSelectionOptions {
    selection: Selection
    zoom: number
    offsetX: number
    offsetY: number
    onResize: (selection: Selection) => void
}

interface ResizableState {
    isResizing: boolean
    activeHandle: ResizeHandle
    startX: number
    startY: number
    originalSelection: Selection | null
}

/**
 * 可调整大小的选区 Hook
 */
export function useResizableSelection({
    selection,
    zoom,
    offsetX,
    offsetY,
    onResize,
}: UseResizableSelectionOptions) {
    const [state, setState] = useState<ResizableState>({
        isResizing: false,
        activeHandle: null,
        startX: 0,
        startY: 0,
        originalSelection: null,
    })

    const handleSize = 8

    // 检测鼠标是否在调整手柄上
    const getHitHandle = useCallback(
        (clientX: number, clientY: number, canvasRect: DOMRect): ResizeHandle => {
            const selX = offsetX + selection.x * zoom
            const selY = offsetY + selection.y * zoom
            const selW = selection.width * zoom
            const selH = selection.height * zoom

            const mx = clientX - canvasRect.left
            const my = clientY - canvasRect.top

            const hitTest = (hx: number, hy: number) =>
                Math.abs(mx - hx) < handleSize && Math.abs(my - hy) < handleSize

            // 四个角
            if (hitTest(selX, selY)) return "nw"
            if (hitTest(selX + selW, selY)) return "ne"
            if (hitTest(selX, selY + selH)) return "sw"
            if (hitTest(selX + selW, selY + selH)) return "se"

            // 四条边的中点
            if (hitTest(selX + selW / 2, selY)) return "n"
            if (hitTest(selX + selW, selY + selH / 2)) return "e"
            if (hitTest(selX + selW / 2, selY + selH)) return "s"
            if (hitTest(selX, selY + selH / 2)) return "w"

            return null
        },
        [selection, zoom, offsetX, offsetY, handleSize]
    )

    // 开始调整大小
    const startResize = useCallback(
        (handle: ResizeHandle, clientX: number, clientY: number) => {
            setState({
                isResizing: true,
                activeHandle: handle,
                startX: clientX,
                startY: clientY,
                originalSelection: { ...selection },
            })
        },
        [selection]
    )

    // 调整大小中
    const updateResize = useCallback(
        (clientX: number, clientY: number) => {
            if (!state.isResizing || !state.originalSelection || !state.activeHandle) return

            const dx = (clientX - state.startX) / zoom
            const dy = (clientY - state.startY) / zoom
            const orig = state.originalSelection

            let newX = orig.x
            let newY = orig.y
            let newW = orig.width
            let newH = orig.height

            switch (state.activeHandle) {
                case "nw":
                    newX = orig.x + dx
                    newY = orig.y + dy
                    newW = orig.width - dx
                    newH = orig.height - dy
                    break
                case "ne":
                    newY = orig.y + dy
                    newW = orig.width + dx
                    newH = orig.height - dy
                    break
                case "sw":
                    newX = orig.x + dx
                    newW = orig.width - dx
                    newH = orig.height + dy
                    break
                case "se":
                    newW = orig.width + dx
                    newH = orig.height + dy
                    break
                case "n":
                    newY = orig.y + dy
                    newH = orig.height - dy
                    break
                case "e":
                    newW = orig.width + dx
                    break
                case "s":
                    newH = orig.height + dy
                    break
                case "w":
                    newX = orig.x + dx
                    newW = orig.width - dx
                    break
            }

            // 确保最小尺寸
            const minSize = 10
            if (newW < minSize) {
                if (state.activeHandle.includes("w")) {
                    newX = orig.x + orig.width - minSize
                }
                newW = minSize
            }
            if (newH < minSize) {
                if (state.activeHandle.includes("n")) {
                    newY = orig.y + orig.height - minSize
                }
                newH = minSize
            }

            onResize({
                id: selection.id,
                x: Math.round(newX),
                y: Math.round(newY),
                width: Math.round(newW),
                height: Math.round(newH),
            })
        },
        [state, zoom, onResize, selection.id]
    )

    // 结束调整大小
    const endResize = useCallback(() => {
        setState({
            isResizing: false,
            activeHandle: null,
            startX: 0,
            startY: 0,
            originalSelection: null,
        })
    }, [])

    // 获取光标样式
    const getCursor = useCallback((handle: ResizeHandle): string => {
        switch (handle) {
            case "nw":
            case "se":
                return "nwse-resize"
            case "ne":
            case "sw":
                return "nesw-resize"
            case "n":
            case "s":
                return "ns-resize"
            case "e":
            case "w":
                return "ew-resize"
            default:
                return "default"
        }
    }, [])

    return {
        isResizing: state.isResizing,
        activeHandle: state.activeHandle,
        getHitHandle,
        startResize,
        updateResize,
        endResize,
        getCursor,
    }
}

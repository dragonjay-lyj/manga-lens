"use client"

import { useCallback, useRef, type TouchEvent } from "react"

interface TouchState {
    startX: number
    startY: number
    lastX: number
    lastY: number
    pinchDistance: number
    isPinching: boolean
    isTouching: boolean
}

interface UseTouchSupportOptions {
    onTouchStart?: (x: number, y: number) => void
    onTouchMove?: (x: number, y: number, dx: number, dy: number) => void
    onTouchEnd?: () => void
    onPinchStart?: (centerX: number, centerY: number) => void
    onPinchMove?: (scale: number, centerX: number, centerY: number) => void
    onPinchEnd?: () => void
}

/**
 * Canvas 触摸支持 Hook
 * 支持单指拖拽和双指缩放
 */
export function useTouchSupport({
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onPinchStart,
    onPinchMove,
    onPinchEnd,
}: UseTouchSupportOptions) {
    const touchState = useRef<TouchState>({
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        pinchDistance: 0,
        isPinching: false,
        isTouching: false,
    })

    // 计算两点距离
    const getDistance = (touches: React.TouchList) => {
        if (touches.length < 2) return 0
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        return Math.sqrt(dx * dx + dy * dy)
    }

    // 计算两点中心
    const getCenter = (touches: React.TouchList) => {
        if (touches.length < 2) {
            return { x: touches[0].clientX, y: touches[0].clientY }
        }
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        }
    }

    const handleTouchStart = useCallback(
        (e: TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault()
            const touches = e.touches

            if (touches.length === 1) {
                // 单指触摸
                const touch = touches[0]
                touchState.current = {
                    ...touchState.current,
                    startX: touch.clientX,
                    startY: touch.clientY,
                    lastX: touch.clientX,
                    lastY: touch.clientY,
                    isTouching: true,
                    isPinching: false,
                }
                onTouchStart?.(touch.clientX, touch.clientY)
            } else if (touches.length === 2) {
                // 双指缩放
                const center = getCenter(touches)
                const distance = getDistance(touches)
                touchState.current = {
                    ...touchState.current,
                    pinchDistance: distance,
                    isPinching: true,
                    isTouching: false,
                }
                onPinchStart?.(center.x, center.y)
            }
        },
        [onTouchStart, onPinchStart]
    )

    const handleTouchMove = useCallback(
        (e: TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault()
            const touches = e.touches
            const state = touchState.current

            if (state.isPinching && touches.length >= 2) {
                // 双指缩放
                const newDistance = getDistance(touches)
                const scale = newDistance / state.pinchDistance
                const center = getCenter(touches)

                touchState.current.pinchDistance = newDistance
                onPinchMove?.(scale, center.x, center.y)
            } else if (state.isTouching && touches.length === 1) {
                // 单指拖拽
                const touch = touches[0]
                const dx = touch.clientX - state.lastX
                const dy = touch.clientY - state.lastY

                touchState.current.lastX = touch.clientX
                touchState.current.lastY = touch.clientY

                onTouchMove?.(touch.clientX, touch.clientY, dx, dy)
            }
        },
        [onTouchMove, onPinchMove]
    )

    const handleTouchEnd = useCallback(
        (e: TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault()
            const state = touchState.current

            if (state.isPinching) {
                onPinchEnd?.()
            } else if (state.isTouching) {
                onTouchEnd?.()
            }

            touchState.current = {
                ...touchState.current,
                isTouching: false,
                isPinching: false,
            }
        },
        [onTouchEnd, onPinchEnd]
    )

    return {
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
    }
}

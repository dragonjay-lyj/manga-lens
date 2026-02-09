import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type IconButtonProps = Omit<React.ComponentProps<typeof Button>, "size" | "children"> & {
  ariaLabel: string
  children: React.ReactNode
  /**
   * 默认使用 44x44 触控热区（h-11 w-11），满足移动端最小触控目标。
   */
  touchTargetClassName?: string
}

export function IconButton({
  ariaLabel,
  className,
  touchTargetClassName = "h-11 w-11",
  children,
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      size="icon"
      aria-label={ariaLabel}
      className={cn(touchTargetClassName, className)}
    >
      {children}
    </Button>
  )
}

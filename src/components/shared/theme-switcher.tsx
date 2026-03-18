"use client"

import { useTheme } from "next-themes"
import { Check, MoonStar, SunMedium } from "lucide-react"
import { IconButton } from "@/components/ui/icon-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const themes = [
  { value: "dark", label: "Dark", labelZh: "深色", icon: MoonStar },
  { value: "light", label: "Light", labelZh: "浅色", icon: SunMedium },
]

interface ThemeSwitcherProps {
  locale?: "en" | "zh"
}

export function ThemeSwitcher({ locale = "zh" }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme()
  const activeTheme = theme === "light" ? "light" : "dark"
  const currentTheme = themes.find((item) => item.value === activeTheme) ?? themes[0]
  const CurrentIcon = currentTheme.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          className="h-11 w-11 border border-border/70 bg-card/60 hover:bg-accent"
          ariaLabel={locale === "zh" ? "切换主题" : "Toggle theme"}
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="sr-only">
            {locale === "zh" ? "切换主题" : "Toggle theme"}
          </span>
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {themes.map((item) => {
          const Icon = item.icon

          return (
            <DropdownMenuItem
              key={item.value}
              onClick={() => setTheme(item.value)}
              className="gap-3"
            >
              <Icon className="h-4 w-4" />
              <span>{locale === "zh" ? item.labelZh : item.label}</span>
              {activeTheme === item.value ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

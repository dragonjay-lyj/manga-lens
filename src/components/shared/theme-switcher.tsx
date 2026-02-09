"use client"

import { useTheme } from "next-themes"
import { IconButton } from "@/components/ui/icon-button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sun, Moon, Waves, Flower2, TreePine } from "lucide-react"

const themes = [
    { value: "light", label: "Light", labelZh: "浅色", icon: Sun },
    { value: "dark", label: "Dark", labelZh: "深色", icon: Moon },
    { value: "ocean", label: "Ocean", labelZh: "海洋", icon: Waves },
    { value: "rose", label: "Rose", labelZh: "玫瑰", icon: Flower2 },
    { value: "forest", label: "Forest", labelZh: "森林", icon: TreePine },
]

interface ThemeSwitcherProps {
    locale?: "en" | "zh"
}

export function ThemeSwitcher({ locale = "zh" }: ThemeSwitcherProps) {
    const { theme, setTheme } = useTheme()

    const currentTheme = themes.find(t => t.value === theme) || themes[1]
    const CurrentIcon = currentTheme.icon

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    variant="ghost"
                    className="h-11 w-11"
                    ariaLabel={locale === "zh" ? "切换主题" : "Toggle theme"}
                >
                    <CurrentIcon className="h-4 w-4" />
                    <span className="sr-only">
                        {locale === "zh" ? "切换主题" : "Toggle theme"}
                    </span>
                </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-card">
                {themes.map((t) => {
                    const Icon = t.icon
                    return (
                        <DropdownMenuItem
                            key={t.value}
                            onClick={() => setTheme(t.value)}
                            className="cursor-pointer gap-2"
                        >
                            <Icon className="h-4 w-4" />
                            <span>{locale === "zh" ? t.labelZh : t.label}</span>
                            {theme === t.value && (
                                <span className="ml-auto text-primary">✓</span>
                            )}
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

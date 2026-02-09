"use client"

import { IconButton } from "@/components/ui/icon-button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Languages } from "lucide-react"

const locales = [
    { value: "zh", label: "中文", flag: "🇨🇳" },
    { value: "en", label: "English", flag: "🇺🇸" },
]

interface LanguageSwitcherProps {
    locale: "en" | "zh"
    onChange: (locale: "en" | "zh") => void
}

export function LanguageSwitcher({ locale, onChange }: LanguageSwitcherProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    variant="ghost"
                    className="h-11 w-11"
                    ariaLabel={locale === "zh" ? "切换语言" : "Switch language"}
                >
                    <Languages className="h-4 w-4" />
                    <span className="sr-only">
                        {locale === "zh" ? "切换语言" : "Switch language"}
                    </span>
                </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-card">
                {locales.map((l) => (
                    <DropdownMenuItem
                        key={l.value}
                        onClick={() => onChange(l.value as "en" | "zh")}
                        className="cursor-pointer gap-2"
                    >
                        <span>{l.flag}</span>
                        <span>{l.label}</span>
                        {locale === l.value && (
                            <span className="ml-auto text-primary">✓</span>
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

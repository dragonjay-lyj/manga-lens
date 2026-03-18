"use client"

import { Check, Languages } from "lucide-react"
import { IconButton } from "@/components/ui/icon-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const locales = [
  { value: "zh", label: "中文", badge: "中" },
  { value: "en", label: "English", badge: "EN" },
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
          className="h-11 w-11 border border-border/70 bg-card/60 hover:bg-accent"
          ariaLabel={locale === "zh" ? "切换语言" : "Switch language"}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">
            {locale === "zh" ? "切换语言" : "Switch language"}
          </span>
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {locales.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onClick={() => onChange(item.value as "en" | "zh")}
            className="gap-3"
          >
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
              {item.badge}
            </span>
            <span>{item.label}</span>
            {locale === item.value ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

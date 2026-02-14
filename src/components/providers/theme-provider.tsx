"use client"

import { useEffect } from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps, useTheme } from "next-themes"

const CUSTOM_THEME_VARIABLES: Record<string, Record<string, string>> = {
    ocean: {
        "--background": "oklch(0.13 0.03 230)",
        "--foreground": "oklch(0.95 0.01 230)",
        "--card": "oklch(0.17 0.03 230)",
        "--card-foreground": "oklch(0.95 0.01 230)",
        "--popover": "oklch(0.17 0.03 230)",
        "--popover-foreground": "oklch(0.95 0.01 230)",
        "--primary": "oklch(0.75 0.15 195)",
        "--primary-foreground": "oklch(0.12 0.03 230)",
        "--secondary": "oklch(0.22 0.03 230)",
        "--secondary-foreground": "oklch(0.95 0.01 230)",
        "--muted": "oklch(0.22 0.03 230)",
        "--muted-foreground": "oklch(0.65 0.02 230)",
        "--accent": "oklch(0.65 0.18 180)",
        "--accent-foreground": "oklch(0.12 0.03 230)",
        "--destructive": "oklch(0.65 0.22 25)",
        "--border": "oklch(0.28 0.03 230)",
        "--input": "oklch(0.22 0.03 230)",
        "--ring": "oklch(0.75 0.15 195)",
    },
    rose: {
        "--background": "oklch(0.13 0.03 350)",
        "--foreground": "oklch(0.95 0.01 350)",
        "--card": "oklch(0.17 0.03 350)",
        "--card-foreground": "oklch(0.95 0.01 350)",
        "--popover": "oklch(0.17 0.03 350)",
        "--popover-foreground": "oklch(0.95 0.01 350)",
        "--primary": "oklch(0.7 0.18 350)",
        "--primary-foreground": "oklch(0.12 0.03 350)",
        "--secondary": "oklch(0.22 0.03 350)",
        "--secondary-foreground": "oklch(0.95 0.01 350)",
        "--muted": "oklch(0.22 0.03 350)",
        "--muted-foreground": "oklch(0.65 0.02 350)",
        "--accent": "oklch(0.75 0.15 5)",
        "--accent-foreground": "oklch(0.12 0.03 350)",
        "--destructive": "oklch(0.65 0.22 25)",
        "--border": "oklch(0.28 0.03 350)",
        "--input": "oklch(0.22 0.03 350)",
        "--ring": "oklch(0.7 0.18 350)",
    },
    forest: {
        "--background": "oklch(0.13 0.03 145)",
        "--foreground": "oklch(0.95 0.01 145)",
        "--card": "oklch(0.17 0.03 145)",
        "--card-foreground": "oklch(0.95 0.01 145)",
        "--popover": "oklch(0.17 0.03 145)",
        "--popover-foreground": "oklch(0.95 0.01 145)",
        "--primary": "oklch(0.7 0.18 155)",
        "--primary-foreground": "oklch(0.12 0.03 145)",
        "--secondary": "oklch(0.22 0.03 145)",
        "--secondary-foreground": "oklch(0.95 0.01 145)",
        "--muted": "oklch(0.22 0.03 145)",
        "--muted-foreground": "oklch(0.65 0.02 145)",
        "--accent": "oklch(0.65 0.2 130)",
        "--accent-foreground": "oklch(0.12 0.03 145)",
        "--destructive": "oklch(0.65 0.22 25)",
        "--border": "oklch(0.28 0.03 145)",
        "--input": "oklch(0.22 0.03 145)",
        "--ring": "oklch(0.7 0.18 155)",
    },
}

const CUSTOM_THEME_KEYS = Array.from(
    new Set(Object.values(CUSTOM_THEME_VARIABLES).flatMap((item) => Object.keys(item)))
)

function CustomThemeStyleBridge() {
    const { theme } = useTheme()

    useEffect(() => {
        const root = document.documentElement
        const variables = theme ? CUSTOM_THEME_VARIABLES[theme] : undefined

        for (const key of CUSTOM_THEME_KEYS) {
            root.style.removeProperty(key)
        }

        if (!variables) {
            return
        }

        for (const [key, value] of Object.entries(variables)) {
            root.style.setProperty(key, value)
        }
    }, [theme])

    return null
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return (
        <NextThemesProvider
            attribute="data-theme"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange={false}
            themes={["light", "dark", "ocean", "rose", "forest"]}
            {...props}
        >
            <CustomThemeStyleBridge />
            {children}
        </NextThemesProvider>
    )
}

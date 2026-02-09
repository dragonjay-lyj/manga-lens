"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes"
import { Toaster } from "sonner"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return (
        <NextThemesProvider
            attribute="data-theme"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange={false}
            themes={["light", "dark", "ocean", "rose", "forest"]}
            {...props}
        >
            {children}
            <Toaster
                position="bottom-right"
                toastOptions={{
                    classNames: {
                        toast: "glass-card",
                        title: "font-semibold",
                        description: "text-muted-foreground",
                    },
                }}
            />
        </NextThemesProvider>
    )
}

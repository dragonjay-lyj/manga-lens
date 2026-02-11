"use client"

import { Toaster } from "sonner"

export function AppToaster() {
    return (
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
    )
}

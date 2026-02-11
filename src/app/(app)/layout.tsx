import { ClerkProvider } from "@clerk/nextjs"
import { AppToaster } from "@/components/providers/app-toaster"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      {children}
      <AppToaster />
    </ClerkProvider>
  )
}

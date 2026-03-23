import { ClerkProvider } from "@clerk/nextjs"
import { AppToaster } from "@/components/providers/app-toaster"
import { getClerkProviderProps } from "@/lib/auth/clerk-config"

// Clerk's App Router typings currently reject partial env-driven props even though runtime supports them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clerkProviderProps = getClerkProviderProps() as any

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider {...clerkProviderProps}>
      {children}
      <AppToaster />
    </ClerkProvider>
  )
}

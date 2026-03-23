import { headers } from "next/headers"
import { ClerkProvider } from "@clerk/nextjs"
import { AppToaster } from "@/components/providers/app-toaster"
import { getClerkProviderPropsForRequest, getRequestContextFromHeaders } from "@/lib/auth/clerk-config"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const headerStore = await headers()
  // Clerk's App Router typings currently reject partial env-driven props even though runtime supports them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerkProviderProps = (await getClerkProviderPropsForRequest(getRequestContextFromHeaders(headerStore))) as any

  return (
    <ClerkProvider {...clerkProviderProps}>
      {children}
      <AppToaster />
    </ClerkProvider>
  )
}

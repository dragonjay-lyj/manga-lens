import { SignIn } from "@clerk/nextjs"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getPrimaryAuthRedirectUrlForRequest, getRequestContextFromHeaders } from "@/lib/auth/clerk-config"

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const headerStore = await headers()
  const primarySignInUrl = await getPrimaryAuthRedirectUrlForRequest(
    "sign-in",
    await searchParams,
    getRequestContextFromHeaders(headerStore),
  )

  if (primarySignInUrl) {
    redirect(primarySignInUrl)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="pattern-grid absolute inset-0 opacity-35" />
        <div className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
        <div className="absolute -right-20 bottom-12 h-80 w-80 rounded-[2rem] bg-accent/25 blur-3xl" />
      </div>

      <SignIn
        appearance={{
          elements: {
            formButtonPrimary:
              "rounded-lg !bg-primary !text-primary-foreground !transition-[background-color,box-shadow,transform] !duration-200 hover:!bg-primary/90 hover:!-translate-y-px hover:!shadow-[var(--shadow-lg)]",
            card: "surface-card rounded-[1.5rem] border border-border/70 shadow-[var(--shadow-xl)]",
          },
        }}
      />
    </div>
  )
}

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { getClerkMiddlewareOptions } from "./lib/auth/clerk-config"

const isProtectedRoute = createRouteMatcher([
  "/editor(.*)",
  "/admin(.*)",
  "/projects(.*)",
  "/profile(.*)",
])

const clerkMiddlewareOptions = getClerkMiddlewareOptions()

// Cloudflare's OpenNext adapter does not support Next.js 16's Node-based proxy.ts yet.
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
}, clerkMiddlewareOptions)

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}

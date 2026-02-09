import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

// 定义需要保护的路由
const isProtectedRoute = createRouteMatcher([
    "/editor(.*)",
    "/admin(.*)",
    "/projects(.*)",
    "/profile(.*)",
])

// 定义公开路由
const isPublicRoute = createRouteMatcher([
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks(.*)",
])

export default clerkMiddleware(async (auth, req) => {
    // 如果是受保护的路由，要求用户登录
    if (isProtectedRoute(req)) {
        await auth.protect()
    }
})

export const config = {
    matcher: [
        // 跳过 Next.js 内部文件和静态文件
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // 始终运行 API 路由
        "/(api|trpc)(.*)",
    ],
}

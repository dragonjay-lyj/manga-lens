import { handleCdnCgiImageRequest, handleImageRequest } from "../.open-next/cloudflare/images.js"
import { runWithCloudflareRequestContext } from "../.open-next/cloudflare/init.js"
import { handler as middlewareHandler } from "../.open-next/middleware/handler.mjs"

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function selectBinding(pathname) {
  if (matchesPrefix(pathname, "/api/ai")) {
    return "AI_WORKER"
  }

  if (matchesPrefix(pathname, "/editor")) {
    return "EDITOR_WORKER"
  }

  if (matchesPrefix(pathname, "/admin") || matchesPrefix(pathname, "/api/admin")) {
    return "ADMIN_WORKER"
  }

  if (
    matchesPrefix(pathname, "/profile") ||
    matchesPrefix(pathname, "/projects") ||
    matchesPrefix(pathname, "/api/payment/linuxdo") ||
    matchesPrefix(pathname, "/api/projects") ||
    matchesPrefix(pathname, "/api/user")
  ) {
    return "ACCOUNT_WORKER"
  }

  return "DEFAULT_WORKER"
}

async function dispatchToBoundWorker(request, env) {
  const bindingName = selectBinding(new URL(request.url).pathname)
  const worker = env[bindingName]

  if (!worker) {
    return new Response(`Missing service binding: ${bindingName}`, { status: 500 })
  }

  return worker.fetch(request)
}

const gatewayWorker = {
  async fetch(request, env, ctx) {
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      const url = new URL(request.url)

      if (url.pathname.startsWith("/cdn-cgi/image/")) {
        return handleCdnCgiImageRequest(url, env)
      }

      if (
        url.pathname ===
        `${globalThis.__NEXT_BASE_PATH__}/_next/image${globalThis.__TRAILING_SLASH__ ? "/" : ""}`
      ) {
        return handleImageRequest(url, request.headers, env)
      }

      const reqOrResp = await middlewareHandler(request, env, ctx)
      if (reqOrResp instanceof Response) {
        return reqOrResp
      }

      return dispatchToBoundWorker(reqOrResp, env)
    })
  },
}

export default gatewayWorker

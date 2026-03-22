import { runWithCloudflareRequestContext } from "../.open-next/cloudflare/init.js"
import { handler } from "../.open-next/server-functions/ai/handler.mjs"

const aiWorker = {
  async fetch(request, env, ctx) {
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      return handler(request, env, ctx, request.signal)
    })
  },
}

export default aiWorker

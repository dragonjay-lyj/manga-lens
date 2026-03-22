import { runWithCloudflareRequestContext } from "../.open-next/cloudflare/init.js"
import { handler } from "../.open-next/server-functions/account/handler.mjs"

const accountWorker = {
  async fetch(request, env, ctx) {
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      return handler(request, env, ctx, request.signal)
    })
  },
}

export default accountWorker

import { runWithCloudflareRequestContext } from "../.open-next/cloudflare/init.js"
import { handler } from "../.open-next/server-functions/editor/index.mjs"

const editorWorker = {
  async fetch(request, env, ctx) {
    return runWithCloudflareRequestContext(request, env, ctx, async () => {
      return handler(request, env, ctx, request.signal)
    })
  },
}

export default editorWorker

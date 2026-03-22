import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"

const rootDir = process.cwd()

const requiredOutputs = [
  ".open-next/middleware/handler.mjs",
  ".open-next/server-functions/default/handler.mjs",
  ".open-next/server-functions/admin/handler.mjs",
  ".open-next/server-functions/editor/handler.mjs",
  ".open-next/server-functions/ai/handler.mjs",
  ".open-next/server-functions/account/handler.mjs",
]

for (const relativePath of requiredOutputs) {
  if (!existsSync(path.join(rootDir, relativePath))) {
    console.error(`Missing build output: ${relativePath}`)
    console.error("Run `npm run build` before deploying the free-plan multi-worker setup.")
    process.exit(1)
  }
}

const configs = [
  "wrangler.default.jsonc",
  "wrangler.admin.jsonc",
  "wrangler.editor.jsonc",
  "wrangler.ai.jsonc",
  "wrangler.account.jsonc",
  "wrangler.jsonc",
]

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx"

for (const config of configs) {
  await new Promise((resolve, reject) => {
    const child = spawn(npxCommand, ["wrangler", "deploy", "--config", config], {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    })

    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`wrangler deploy failed for ${config} with exit code ${code ?? "unknown"}`))
    })

    child.on("error", reject)
  })
}

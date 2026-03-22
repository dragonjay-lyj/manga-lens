import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"

const rootDir = process.cwd()

const requiredOutputs = [
  {
    label: "middleware worker",
    paths: [".open-next/middleware/handler.mjs"],
  },
  {
    label: "default server worker",
    paths: [".open-next/server-functions/default/handler.mjs"],
  },
  {
    label: "admin server worker",
    paths: [
      ".open-next/server-functions/admin/index.mjs",
      ".open-next/server-functions/admin/handler.mjs",
    ],
  },
  {
    label: "editor server worker",
    paths: [
      ".open-next/server-functions/editor/index.mjs",
      ".open-next/server-functions/editor/handler.mjs",
    ],
  },
  {
    label: "ai server worker",
    paths: [
      ".open-next/server-functions/ai/index.mjs",
      ".open-next/server-functions/ai/handler.mjs",
    ],
  },
  {
    label: "account server worker",
    paths: [
      ".open-next/server-functions/account/index.mjs",
      ".open-next/server-functions/account/handler.mjs",
    ],
  },
]

for (const output of requiredOutputs) {
  const hasExpectedOutput = output.paths.some((relativePath) =>
    existsSync(path.join(rootDir, relativePath)),
  )

  if (!hasExpectedOutput) {
    console.error(`Missing build output for ${output.label}.`)
    console.error(`Checked: ${output.paths.join(", ")}`)
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
const ciLockedConfigs = new Set(configs.filter((config) => config !== "wrangler.jsonc"))
const ciOverrideEnvKeys = [
  "WRANGLER_CI_MATCH_TAG",
  "WRANGLER_CI_OVERRIDE_NAME",
]

for (const config of configs) {
  const childEnv = { ...process.env }
  childEnv.OPEN_NEXT_DEPLOY = "true"

  if (ciLockedConfigs.has(config)) {
    for (const key of ciOverrideEnvKeys) {
      delete childEnv[key]
    }
  }

  await new Promise((resolve, reject) => {
    const child = spawn(npxCommand, ["wrangler", "deploy", "--config", config], {
      cwd: rootDir,
      env: childEnv,
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

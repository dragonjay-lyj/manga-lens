import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { build } from "esbuild"
import { needsExperimentalReact } from "../../node_modules/@opennextjs/cloudflare/dist/cli/build/utils/needs-experimental-react.js"
import { shimRequireHook } from "../../node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/require-hook.js"
import { shimReact } from "../../node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/shim-react.js"
import { setWranglerExternal } from "../../node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/wrangler-external.js"

const rootDir = process.cwd()
const openNextOutputDir = path.join(rootDir, ".open-next")
const splitServerFunctions = ["admin", "editor", "ai", "account"]
const runtimePatchedFiles = [".open-next/server-functions/default/handler.mjs"]

function getServerFunctionRelativePath(functionName, fileName) {
  return `.open-next/server-functions/${functionName}/${fileName}`
}

async function readNextStandaloneConfig(functionName) {
  const requiredServerFilesPath = path.join(
    rootDir,
    getServerFunctionRelativePath(functionName, ".next/required-server-files.json"),
  )

  const requiredServerFiles = JSON.parse(await readFile(requiredServerFilesPath, "utf8"))
  return requiredServerFiles.config
}

async function patchOpenNextRuntimeFile(relativePath) {
  const fullPath = path.join(rootDir, relativePath)

  if (!existsSync(fullPath)) {
    return
  }

  const currentCode = await readFile(fullPath, "utf8")
  const patchedCode = currentCode
    .replace(/__require\d?\(/g, "require(")
    .replace(/__require\d?\./g, "require.")
    .replace(
      /cacheHandlerPath\s*=\s*(?:__require\d*|require)\.resolve\((['"])\.\/cache\.cjs\1\)/g,
      'cacheHandlerPath=""',
    )
    .replace(
      /composableCacheHandlerPath\s*=\s*(?:__require\d*|require)\.resolve\((['"])\.\/composable-cache\.cjs\1\)/g,
      'composableCacheHandlerPath=""',
    )
    .replace(/eval\("require"\)/g, "require")
    .replace(
      /require\((['"])@opentelemetry\/api\1\)/g,
      'require("next/dist/compiled/@opentelemetry/api")',
    )
    .replace(
      /function setNextjsServerWorkingDirectory\(\)\s*\{[^{}]*process\.chdir\([^)]*\);?\s*\}/g,
      "function setNextjsServerWorkingDirectory() {}",
    )

  if (patchedCode !== currentCode) {
    await writeFile(fullPath, patchedCode)
  }

  if (/(?:__require\d*|require)\.resolve\(/.test(patchedCode)) {
    throw new Error(`Unsupported require.resolve remained after patching: ${relativePath}`)
  }
}

async function bundleSplitWorkerHandler(functionName) {
  const inputRelativePath = getServerFunctionRelativePath(functionName, "index.mjs")
  const outputRelativePath = getServerFunctionRelativePath(functionName, "handler.mjs")
  const nextConfig = await readNextStandaloneConfig(functionName)

  await build({
    entryPoints: [path.join(rootDir, inputRelativePath)],
    bundle: true,
    outfile: path.join(rootDir, outputRelativePath),
    format: "esm",
    target: "esnext",
    platform: "node",
    conditions: ["workerd"],
    minifyWhitespace: true,
    minifyIdentifiers: false,
    minifySyntax: true,
    legalComments: "none",
    external: ["./middleware/handler.mjs"],
    plugins: [
      shimRequireHook({ outputDir: openNextOutputDir }),
      shimReact({ outputDir: openNextOutputDir }),
      setWranglerExternal(),
    ],
    alias: {
      "next/dist/compiled/node-fetch": path.join(
        openNextOutputDir,
        "cloudflare-templates/shims/fetch.js",
      ),
      "next/dist/compiled/ws": path.join(openNextOutputDir, "cloudflare-templates/shims/empty.js"),
      "next/dist/compiled/@ampproject/toolbox-optimizer": path.join(
        openNextOutputDir,
        "cloudflare-templates/shims/throw.js",
      ),
      "next/dist/compiled/edge-runtime": path.join(
        openNextOutputDir,
        "cloudflare-templates/shims/empty.js",
      ),
      "@next/env": path.join(openNextOutputDir, "cloudflare-templates/shims/env.js"),
    },
    define: {
      "process.env.__NEXT_PRIVATE_STANDALONE_CONFIG": JSON.stringify(JSON.stringify(nextConfig)),
      __dirname: '""',
      __non_webpack_require__: "require",
      "process.env.NEXT_RUNTIME": '"nodejs"',
      "process.env.NODE_ENV": '"production"',
      "process.env.__NEXT_EXPERIMENTAL_REACT": `${needsExperimentalReact(nextConfig)}`,
      "process.env.__NEXT_TRUST_HOST_HEADER": "true",
    },
    banner: {
      js: 'import {setInterval, clearInterval, setTimeout, clearTimeout} from "node:timers"',
    },
  })

  await patchOpenNextRuntimeFile(outputRelativePath)
}

for (const relativePath of runtimePatchedFiles) {
  await patchOpenNextRuntimeFile(relativePath)
}

const requiredBuildOutputs = [
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
    paths: [getServerFunctionRelativePath("admin", "index.mjs")],
  },
  {
    label: "editor server worker",
    paths: [getServerFunctionRelativePath("editor", "index.mjs")],
  },
  {
    label: "ai server worker",
    paths: [getServerFunctionRelativePath("ai", "index.mjs")],
  },
  {
    label: "account server worker",
    paths: [getServerFunctionRelativePath("account", "index.mjs")],
  },
]

for (const output of requiredBuildOutputs) {
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

await Promise.all(splitServerFunctions.map((functionName) => bundleSplitWorkerHandler(functionName)))

for (const functionName of splitServerFunctions) {
  const handlerRelativePath = getServerFunctionRelativePath(functionName, "handler.mjs")

  if (!existsSync(path.join(rootDir, handlerRelativePath))) {
    console.error(`Missing generated split worker handler for ${functionName}.`)
    console.error(`Expected: ${handlerRelativePath}`)
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

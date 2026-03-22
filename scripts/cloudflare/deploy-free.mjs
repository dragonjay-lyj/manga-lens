import { existsSync } from "node:fs"
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { getNextVersion } from "../../node_modules/@opennextjs/aws/dist/build/helper.js"
import { bundleServer } from "../../node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js"

const rootDir = process.cwd()
const openNextOutputDir = path.join(rootDir, ".open-next")
const splitWorkerBundleDir = path.join(openNextOutputDir, ".split-worker-bundles")
const splitServerFunctions = ["admin", "editor", "ai", "account"]
const runtimePatchedFiles = [".open-next/server-functions/default/handler.mjs"]
const unsupportedRuntimePatterns = [
  /cacheHandlerPath\s*=\s*(?:__require\d*|require)\.resolve\((['"])\.\/cache\.cjs\1\)/,
  /composableCacheHandlerPath\s*=\s*(?:__require\d*|require)\.resolve\((['"])\.\/composable-cache\.cjs\1\)/,
  /function setNextjsServerWorkingDirectory\(\)\s*\{[^{}]*process\.chdir\([^)]*\);?\s*\}/,
]
const nextVersion = getNextVersion(rootDir)
const bundleServerConfig = {
  cloudflare: {
    useWorkerdCondition: true,
  },
}

function getServerFunctionRelativePath(functionName, fileName) {
  return `.open-next/server-functions/${functionName}/${fileName}`
}

function getServerFunctionDirectory(functionName) {
  return path.join(rootDir, ".open-next/server-functions", functionName)
}

function createSplitBundleBuildOptions(outputDir) {
  return {
    appBuildOutputPath: rootDir,
    appPath: rootDir,
    config: bundleServerConfig,
    debug: false,
    monorepoRoot: rootDir,
    nextVersion,
    outputDir,
  }
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

  const remainingUnsupportedPattern = unsupportedRuntimePatterns.find((pattern) =>
    pattern.test(patchedCode),
  )

  if (remainingUnsupportedPattern) {
    throw new Error(
      `Unsupported runtime pattern remained after patching: ${relativePath} :: ${remainingUnsupportedPattern}`,
    )
  }
}

async function bundleSplitWorkerHandler(functionName) {
  const outputRelativePath = getServerFunctionRelativePath(functionName, "handler.mjs")
  const sourceDir = getServerFunctionDirectory(functionName)
  const tempOutputDir = path.join(splitWorkerBundleDir, functionName)
  const tempDefaultDir = path.join(tempOutputDir, "server-functions/default")

  await rm(tempOutputDir, { recursive: true, force: true })

  try {
    await mkdir(path.join(tempOutputDir, "server-functions"), { recursive: true })
    await cp(sourceDir, tempDefaultDir, { recursive: true })

    await bundleServer(createSplitBundleBuildOptions(tempOutputDir), { minify: true })

    const bundledHandlerPath = path.join(tempDefaultDir, "handler.mjs")

    if (!existsSync(bundledHandlerPath)) {
      throw new Error(`OpenNext did not emit a bundled handler for ${functionName}.`)
    }

    await copyFile(bundledHandlerPath, path.join(rootDir, outputRelativePath))
    await patchOpenNextRuntimeFile(outputRelativePath)
  } finally {
    await rm(tempOutputDir, { recursive: true, force: true })
  }
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

for (const functionName of splitServerFunctions) {
  await bundleSplitWorkerHandler(functionName)
}

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

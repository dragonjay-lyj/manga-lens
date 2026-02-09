import { spawn } from "node:child_process"

const PORT = Number(process.env.AUDIT_PORT || 4173)
const BASE_URL = process.env.AUDIT_BASE_URL || `http://localhost:${PORT}`

function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: "inherit",
      shell: true,
      ...options,
    })

    child.on("exit", (code) => resolve(code ?? 1))
    child.on("error", reject)
  })
}

async function isServerReady(url) {
  try {
    const response = await fetch(url, { redirect: "manual" })
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  }
}

async function waitForServer(url, timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isServerReady(url)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

async function stopProcessTree(processRef) {
  if (!processRef?.pid) return

  if (process.platform === "win32") {
    await runCommand(`taskkill /PID ${processRef.pid} /T /F`)
    return
  }

  processRef.kill("SIGTERM")
}

function runNodeScript(scriptPath, extraEnv = {}) {
  return runCommand(`${process.execPath} ${scriptPath}`, {
    env: {
      ...process.env,
      ...extraEnv,
    },
  })
}

async function main() {
  let devProcess = null
  let startedByScript = false
  let exitCode = 1

  if (!(await isServerReady(BASE_URL))) {
    console.log(`No server detected at ${BASE_URL}, building and starting local server...`)
    const buildCode = await runCommand("npm run build")
    if (buildCode !== 0) {
      throw new Error(`Build failed with exit code ${buildCode}`)
    }

    devProcess = spawn(`npm run start -- --port ${PORT}`, {
      stdio: "inherit",
      shell: true,
    })
    startedByScript = true

    const ready = await waitForServer(BASE_URL, 180000)
    if (!ready) {
      if (devProcess) devProcess.kill("SIGTERM")
      throw new Error(`Dev server did not become ready at ${BASE_URL}`)
    }
  }

  try {
    exitCode = await runNodeScript("scripts/a11y/axe-audit.mjs", { AUDIT_BASE_URL: BASE_URL })
  } finally {
    if (startedByScript && devProcess) {
      await stopProcessTree(devProcess)
    }
  }

  process.exit(exitCode)
}

main().catch((error) => {
  console.error("audit:axe failed:", error)
  process.exit(1)
})

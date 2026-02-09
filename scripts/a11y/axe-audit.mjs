import fs from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"
import AxeBuilder from "@axe-core/playwright"

const BASE_URL = process.env.AUDIT_BASE_URL || "http://localhost:4173"
const TARGET_PATHS = ["/", "/editor", "/profile/recharge", "/profile/billing", "/admin"]
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]

function isAuthRedirect(url) {
  const pathname = new URL(url).pathname
  return pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    pages: [],
    summary: {
      scanned: 0,
      skipped: 0,
      violations: 0,
      passes: 0,
    },
  }

  try {
    for (const route of TARGET_PATHS) {
      const page = await context.newPage()
      const target = new URL(route, BASE_URL).toString()
      try {
        await page.goto(target, { waitUntil: "networkidle" })
        const finalUrl = page.url()

        if (isAuthRedirect(finalUrl)) {
          report.pages.push({
            route,
            finalUrl,
            skipped: true,
            reason: "requires_authentication",
          })
          report.summary.skipped += 1
          await page.close()
          continue
        }

        const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze()
        const violations = axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        }))

        report.pages.push({
          route,
          finalUrl,
          skipped: false,
          violations,
          violationCount: violations.length,
        })

        report.summary.scanned += 1
        report.summary.violations += violations.length
        if (violations.length === 0) {
          report.summary.passes += 1
        }
      } catch (error) {
        report.pages.push({
          route,
          finalUrl: target,
          skipped: true,
          reason: "navigation_error",
          error: error instanceof Error ? error.message : String(error),
        })
        report.summary.skipped += 1
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }

  const outDir = path.join(process.cwd(), "reports")
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, "axe-report.json")
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8")

  console.log(`Axe audit report written to ${outPath}`)
  console.log(`Scanned: ${report.summary.scanned}, Skipped: ${report.summary.skipped}, Violations: ${report.summary.violations}`)

  if (report.summary.violations > 0) {
    process.exit(1)
  }
}

run().catch((error) => {
  console.error("Axe audit failed:", error)
  process.exit(1)
})

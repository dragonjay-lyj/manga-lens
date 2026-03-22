import { defineCloudflareConfig } from "@opennextjs/cloudflare"

const baseConfig = defineCloudflareConfig({})

const openNextConfig = {
  ...baseConfig,
  default: {
    ...baseConfig.default,
    minify: true,
  },
  functions: {
    admin: {
      minify: true,
      routes: [
        "app/(app)/admin/page",
        "app/(app)/admin/analytics/page",
        "app/(app)/admin/payments/page",
        "app/(app)/admin/settings/page",
        "app/(app)/admin/settings/ai/page",
        "app/(app)/admin/settings/payment/page",
        "app/(app)/admin/users/page",
        "app/api/admin/analytics/route",
        "app/api/admin/payments/route",
        "app/api/admin/payments/reconcile/route",
        "app/api/admin/settings/route",
        "app/api/admin/users/route",
      ],
      patterns: ["admin", "admin/*", "api/admin/*"],
    },
    ai: {
      minify: true,
      routes: [
        "app/api/ai/detect-text/route",
        "app/api/ai/generate/route",
        "app/api/ai/inpaint/route",
        "app/api/ai/translate-text/route",
        "app/api/ai/translate-vision/route",
      ],
      patterns: ["api/ai/*"],
    },
    account: {
      minify: true,
      routes: [
        "app/(app)/projects/page",
        "app/(app)/profile/page",
        "app/(app)/profile/billing/page",
        "app/(app)/profile/billing/orders/[outTradeNo]/page",
        "app/(app)/profile/recharge/page",
        "app/api/payment/linuxdo/config/route",
        "app/api/payment/linuxdo/create/route",
        "app/api/payment/linuxdo/notify/route",
        "app/api/payment/linuxdo/query/route",
        "app/api/projects/route",
        "app/api/projects/[id]/route",
        "app/api/user/api-keys/route",
        "app/api/user/billing/transactions/route",
        "app/api/user/billing/transactions/[outTradeNo]/route",
        "app/api/user/coins/route",
        "app/api/user/role/route",
        "app/api/user/usage/log/route",
        "app/api/user/usage/stats/route",
      ],
      patterns: [
        "profile",
        "profile/*",
        "projects",
        "projects/*",
        "api/payment/linuxdo/*",
        "api/projects",
        "api/projects/*",
        "api/user/*",
      ],
    },
  },
}

export default openNextConfig

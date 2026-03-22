# Cloudflare Free Plan Deployment

This repository includes a multi-worker deployment layout for staying under the Cloudflare Workers free-plan size limit.

## Commands

- Build command: `npm run build`
- Deploy command: `npm run upload:free`

For a one-shot local deployment, use:

- `npm run deploy:free`

## Workers

The free-plan layout deploys these workers:

- `manga-lens`
- `manga-lens-default`
- `manga-lens-admin`
- `manga-lens-ai`
- `manga-lens-account`

The gateway worker is `manga-lens`. It runs middleware, serves assets and routes requests to the bound workers.

## Required Secrets And Vars

Every worker that executes server code needs the same runtime secrets and variables that the single-worker setup used before.

At minimum, configure the following for all server workers:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

If you use site-level AI, OCR or payment providers, copy those variables too.

## Cloudflare Dashboard Notes

- The project deploy command must not stay as `npx wrangler deploy`.
- Set it to `npm run upload:free`.
- The build command should stay `npm run build`.
- Workers Builds injects CI variables that force `wrangler deploy` to target the connected Worker name. The checked-in deploy script clears that override for child workers before publishing them.
- The deploy script also forces `OPEN_NEXT_DEPLOY=true` so Wrangler does not auto-delegate custom worker uploads back into `opennextjs-cloudflare deploy`.
- Child workers are still bundled by Wrangler during deploy. Extra runtime dependencies such as `critters` and `@opentelemetry/api` are installed in the app so that bundle step can resolve them.
- The child-worker Wrangler configs also alias `@opentelemetry/api` to `next/dist/compiled/@opentelemetry/api`, matching OpenNext's own patching strategy for traced Next internals.
- The server-worker Wrangler configs also alias `next/dist/compiled/@vercel/og/index.edge.js` to a local stub. This app does not define any `next/og` or `ImageResponse` routes, so removing the unused OG runtime keeps the free-plan bundles under the 3 MiB limit.
- OpenNext only emits a bundled `handler.mjs` for the default server worker. The deploy script now reuses OpenNext's own `bundleServer` pipeline to generate equivalent bundled `handler.mjs` files for `admin`, `ai`, and `account` before uploading them.
- `/editor` stays on the default worker path because it is a prerendered static route. Keeping it out of the split server-worker list avoids shipping the editor's large client dependency graph inside a dedicated free-plan worker.

## Operational Notes

- The deploy script uploads child workers first, then the gateway worker.
- Service bindings are declared in the checked-in `wrangler*.jsonc` files.
- All server workers now boot from bundled `.open-next/server-functions/*/handler.mjs` files.
- Child workers keep `WORKER_SELF_REFERENCE` pointed at the gateway worker so internal OpenNext callbacks still re-enter through middleware.
- This setup is intended for the Workers free plan where a single OpenNext worker is too large.

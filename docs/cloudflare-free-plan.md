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
- `manga-lens-editor`
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

## Operational Notes

- The deploy script uploads child workers first, then the gateway worker.
- Service bindings are declared in the checked-in `wrangler*.jsonc` files.
- Non-default server workers boot from `.open-next/server-functions/*/index.mjs`; only the default worker gets a bundled `handler.mjs`.
- Child workers keep `WORKER_SELF_REFERENCE` pointed at the gateway worker so internal OpenNext callbacks still re-enter through middleware.
- This setup is intended for the Workers free plan where a single OpenNext worker is too large.

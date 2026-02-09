# Initial Findings (Post-P0/P1 Pass)

## Fixed in this pass
- `src/components/editor/sidebar.tsx`: replaced clickable `div` with semantic `button`, added labels, enlarged delete control target.
- `src/components/editor/image-preview.tsx`: replaced clickable `div` with semantic `button`, removed hover-only destructive action dependency, added accessible labels.
- `src/components/editor/canvas.tsx`: icon controls now include explicit `aria-label` and larger touch targets.
- `src/app/page.tsx`: added explicit `main` landmark, removed misleading clickable-only card affordance.
- `src/app/layout.tsx`: added skip-link for keyboard users.
- `src/app/globals.css`: added `prefers-reduced-motion` fallback.
- `src/app/profile/page.tsx`: migrated avatar from `<img>` to `next/image`, improved label/input associations.
- `src/app/profile/recharge/page.tsx`: improved icon button accessibility and form labeling.
- `src/app/profile/billing/page.tsx`: improved back navigation accessibility and main landmark id.
- `src/app/profile/billing/orders/[outTradeNo]/page.tsx`: improved back navigation accessibility and main landmark id.
- `src/app/admin/layout.tsx`: sidebar collapse icon now has accessible name and larger touch target.
- `src/app/admin/users/page.tsx`: action menu trigger now has explicit label and larger target.
- `src/app/projects/page.tsx`: edit/delete icon buttons now have explicit labels and larger target.

## Remaining manual/runtime checks
- Authenticated runtime checks for `/editor`, `/profile/*`, `/admin/*` require test users.
- Screen-reader verification for live updates/toasts across generation and payment status.
- Dual-language overflow checks after content changes.

## Automated Audit Snapshot
- `npm run lint:a11y`: passed with warnings only (no errors).
- `npm run audit:axe`: passed, report at `reports/axe-report.json`.
  - `Scanned: 1`, `Skipped: 4`, `Violations: 0`.
  - Skipped routes currently require valid auth runtime (Clerk session).
- `npm run audit:lighthouse`: executed successfully.
  - Best-practice score warnings remain on routes that redirect to Clerk sign-in.

## Pending follow-up (optional P2)
- Additional UX polish on dense icon layouts where 44px targets increase visual density.
- Extend `main` landmark consistency across all secondary static pages.

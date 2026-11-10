# Security review (Phase 14, 2026-11-11)

## Summary

| Area | How it is protected | Checked by |
|---|---|---|
| Logged-out access | Pages redirect to `/login`; API returns 401 | Production server check; unit tests (route access) |
| One user reading another's data | Row Level Security on every table; storage paths must be `{user}/{case}/…` of an owned case; other users' case URLs show "not found" | 40 database tests (RLS, cases, facts, documents, financial, resolution, legal KB, account) |
| Cross-site requests (CSRF) | API: JSON only + same-origin; uploads: `Origin` header **required** and must match; server actions: Next.js built-in origin check | Production server check (cross-site and no-origin upload → 403) |
| Uploads | Real type from the file's first bytes (PDF/JPG/PNG only), 10 MB, 25 per case, safe file names, private bucket, no overwrites, 60-second view links | Unit + database tests (fake PDF rejected, other user can't read/upload) |
| AI misuse | Keys server-only; free-tier rate limits per user (chat, document reads, legal); user/document text treated as data, never instructions; sensitive numbers (Aadhaar, PAN, account, OTP) removed before storing or sending to AI | Unit + AI tests |
| Wrong legal or financial information | Calculations are deterministic code (no AI). Legal text only from verified official sources; AI points without valid citations, with invented sections/Acts or illegality claims are removed | Unit tests with hand-calculated values; legal checker tests; AI end-to-end tests |
| Secrets | `.env*` git-ignored; service-role key used only in admin scripts and for deleting the user's own login | Code search |
| Error leaks | Generic error messages; logs contain status codes only, never message text or personal data | Code search |
| Security headers | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS; `X-Powered-By` removed | Production server check |
| Account deletion | Settings → type DELETE. Files removed first, then the login; every row is removed by cascade | Database test (login, rows, files gone; other user untouched) |
| Dependencies | `npm audit --omit=dev`: **0 vulnerabilities**. `shadcn` (a code generator) moved to dev dependencies | `npm audit` |

## Known limitations / follow-ups

- **Content-Security-Policy** does not yet restrict scripts (`script-src`). Doing that safely needs per-request nonces with Next.js partial prerendering; planned before real users.
- Dev-only tools (`eslint-config-next`, `shadcn`, Supabase CLI) have moderate advisories. They never run in the deployed app.
- **Free AI tiers** (Groq, Gemini) may use submitted content to improve their products. The app tells users to use made-up data only. Real users need a paid, no-training agreement.
- Supabase's built-in email sender is rate-limited; a custom SMTP provider is needed before real users.
- The AI's paraphrase of a legal passage can still be imperfect (see PROJECT_STATUS, Phase 11). The exact source text is always shown beside each point.

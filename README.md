# Nyaya AI

Financial and legal information assistant for borrowers in Andhra Pradesh and
Telangana who are in disputes with informal private lenders.

> Nyaya AI provides legal information, not legal advice. It is not a lawyer.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in values when a phase needs them
npm run dev                  # open http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally with live reload |
| `npm run lint` | Check code style and common mistakes |
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Production build |

## Structure

```
src/app/(marketing)   Landing page
src/app/(auth)        Login, signup
src/app/(app)         Logged-in area: dashboard, cases, settings
src/app/(app)/cases/[id]/*   Case workspace tabs
src/components        UI (ui/ = shadcn components)
src/lib               Shared helpers (i18n, navigation, supabase, openai…)
src/modules           Domain logic (financial engine, legal RAG, …)
supabase/migrations   Database SQL
tests/                Unit and integration tests
docs/                 Architecture and setup docs
```

Progress is tracked in [PROJECT_STATUS.md](PROJECT_STATUS.md).

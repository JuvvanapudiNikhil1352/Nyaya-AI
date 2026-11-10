# Setup

## 1. Install
```
npm install
```

## 2. Environment variables
Copy `.env.example` to `.env.local` and fill it in. Open it with `notepad .env.local`.

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → Secret key (**keep private**) |
| `SUPABASE_DB_URL` | See "Database connection" below |

Check them with:
```
npm run check:env
```

## 3. Supabase Auth settings
- **Authentication → URL Configuration:**
  - Site URL: `http://localhost:3000`
  - Redirect URLs: add `http://localhost:3000/**`
- **Authentication → Sign In / Providers:** Email is enabled.

## 4. Database connection
1. In Supabase, click **Connect** in the top bar.
2. Choose the **Session pooler** connection string (it works on networks without IPv6). It looks like:
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`
3. Replace `[YOUR-PASSWORD]` with your database password. Remove the square brackets too.
   - If your password contains `@`, `#`, `/`, `?` or `%`, reset it to letters and numbers only: **Project Settings → Database → Reset database password**.
4. Paste the result after `SUPABASE_DB_URL=` in `.env.local`.

## 5. Apply the database migrations
```
npm run db:push -- --dry-run   # preview
npm run db:push                # apply
```

## 6. Run
```
npm run dev              # http://localhost:3000
npm test                 # unit tests
npm run test:integration # database tests (needs .env.local)
```

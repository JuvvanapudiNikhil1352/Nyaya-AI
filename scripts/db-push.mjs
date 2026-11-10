// Applies supabase/migrations/*.sql to your Supabase database.
// Usage: npm run db:push            (apply)
//        npm run db:push -- --dry-run   (show what would be applied)
// Needs SUPABASE_DB_URL in .env.local. The URL is never printed.
import { spawnSync } from "node:child_process";

const url = (process.env.SUPABASE_DB_URL ?? "").trim();
if (!url) {
  console.error("SUPABASE_DB_URL is empty in .env.local. See docs/setup.md (Database connection).");
  process.exit(1);
}
if (url.includes("[YOUR-PASSWORD]")) {
  console.error("SUPABASE_DB_URL still contains [YOUR-PASSWORD]. Replace it with your database password.");
  process.exit(1);
}

const extra = process.argv.slice(2);
const result = spawnSync("npx", ["supabase", "db", "push", `--remote=${url}`, "--yes", ...extra], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);

// Diagnoses where signup confirmation links send people, without sending email.
// Usage: npm run check:auth-link -- https://your-site.example
// Creates a throwaway user, generates its confirmation link, follows it once
// (like a browser click) and deletes the user again. Tokens are never printed.
import { createClient } from "@supabase/supabase-js";

const site = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(site)) {
  console.error("Usage: npm run check:auth-link -- https://your-site.example");
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const hide = (s) => s.replace(/([?#&](code|access_token|refresh_token|token|token_hash)=)[^&]+/g, "$1…").replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, "https://<project>.supabase.co");

const { data, error } = await admin.auth.admin.generateLink({
  type: "signup",
  email: `nyaya-linkcheck-${Date.now()}@example.com`,
  password: `Pw-${Date.now()}-check`,
  options: { redirectTo: `${site}/auth/confirm?next=/dashboard` },
});
if (error) {
  console.error("Could not generate a link:", error.message);
  process.exit(1);
}
try {
  const res = await fetch(data.properties.action_link, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "(none)";
  console.log("Asked Supabase to return to:", `${site}/auth/confirm?next=/dashboard`);
  console.log("Supabase actually sends the browser to:", hide(loc));
  if (!loc.startsWith(`${site}/auth/confirm`)) {
    console.log(
      "\n✗ PROBLEM: Supabase ignored the requested address. Add it to Supabase → Authentication → URL Configuration → Redirect URLs:\n   " +
        `${site}/**` +
        "\n  and set Site URL to your live address.",
    );
  } else {
    console.log("\n✓ OK: confirmation links return to the app.");
  }
} finally {
  await admin.auth.admin.deleteUser(data.user.id);
}

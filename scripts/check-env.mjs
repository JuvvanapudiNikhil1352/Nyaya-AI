// Checks .env.local and the connections to Supabase and the AI providers
// WITHOUT printing any secret values. Run with: npm run check:env

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

let ok = true;
const mark = (pass, msg) => {
  console.log(`${pass ? "OK  " : "FAIL"}  ${msg}`);
  if (!pass) ok = false;
};
const clean = (name, v) => {
  if (/^["']|["']$|\s/.test(v)) mark(false, `${name} contains quotes or spaces — remove them`);
};

// --- Supabase ---
for (const name of required) {
  const v = (process.env[name] ?? "").trim();
  mark(v.length > 0, `${name} is ${v ? `set (${v.length} characters)` : "EMPTY"}`);
  clean(name, v);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (url) mark(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url), "Supabase URL looks like https://<project>.supabase.co");
if (anon && secret) mark(anon !== secret, "Public key and secret key are different");
if (anon.startsWith("sb_secret_")) mark(false, "NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET key — swap them!");

if (url && anon) {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } });
    mark(res.ok, `Connected to Supabase Auth with the public key (HTTP ${res.status})`);
    if (res.ok) {
      const s = await res.json();
      console.log(`      Email sign-in enabled: ${s?.external?.email ? "yes" : "NO — enable it in Authentication → Sign In / Providers"}`);
      console.log(`      Email confirmation required: ${s?.mailer_autoconfirm ? "no" : "yes"}`);
    }
  } catch (e) {
    mark(false, `Could not reach Supabase: ${e.message}`);
  }
}

// --- AI providers (only lists models; never sends case data) ---
const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
const available = { gemini: null, groq: null };

if (geminiKey) {
  clean("GEMINI_API_KEY", geminiKey);
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
      headers: { "x-goog-api-key": geminiKey },
    });
    mark(res.ok, `Connected to Google Gemini (HTTP ${res.status})`);
    if (res.ok) {
      const { models = [] } = await res.json();
      available.gemini = models.map((m) => m.name.replace("models/", ""));
      const embed = models
        .filter((m) => m.supportedGenerationMethods?.includes("embedContent"))
        .map((m) => m.name.replace("models/", ""));
      const chosen = (process.env.GEMINI_EMBEDDING_MODEL ?? "").trim();
      if (chosen) mark(embed.includes(chosen), `GEMINI_EMBEDDING_MODEL="${chosen}" is available`);
    }
  } catch (e) {
    mark(false, `Could not reach Google Gemini: ${e.message}`);
  }
} else {
  console.log("SKIP  GEMINI_API_KEY is empty (needed for documents and legal search)");
}

if (groqKey) {
  clean("GROQ_API_KEY", groqKey);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${groqKey}` } });
    mark(res.ok, `Connected to Groq (HTTP ${res.status})`);
    if (res.ok) available.groq = ((await res.json()).data ?? []).map((m) => m.id);
  } catch (e) {
    mark(false, `Could not reach Groq: ${e.message}`);
  }
} else {
  console.log("SKIP  GROQ_API_KEY is empty");
}

const chain = (process.env.AI_CHAT_CHAIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
mark(chain.length > 0, `AI_CHAT_CHAIN lists ${chain.length} model(s)`);
for (const entry of chain) {
  const i = entry.indexOf(":");
  const provider = entry.slice(0, i);
  const model = entry.slice(i + 1);
  if (!(provider in available)) {
    mark(false, `Chat chain: unknown provider "${provider}" in "${entry}"`);
    continue;
  }
  const list = available[provider];
  if (!list) {
    console.log(`SKIP  Chat chain: ${entry} (no ${provider} key)`);
    continue;
  }
  mark(list.includes(model), `Chat chain: ${entry} is available`);
}

console.log(ok ? "\nAll checks passed." : "\nSome checks failed — see above.");
process.exit(ok ? 0 : 1);

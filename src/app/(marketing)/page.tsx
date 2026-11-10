import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CircleCheck,
  ClipboardList,
  EyeOff,
  FilePen,
  FileSearch,
  Gavel,
  Lock,
  MessageSquare,
  Phone,
  Route,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    icon: MessageSquare,
    title: "Describe your problem",
    text: "Tell us in your own words: how much you borrowed, what you have repaid, and what the lender is asking for.",
  },
  {
    icon: Upload,
    title: "Add any documents you have",
    text: "Promissory notes, receipts, bank statements or message screenshots. It's fine if you don't have them all.",
  },
  {
    icon: ClipboardList,
    title: "Check your case summary",
    text: "We show what we understood, where each detail came from, and what is still missing. You correct anything that is wrong.",
  },
  {
    icon: Calculator,
    title: "See the numbers",
    text: "Transparent, step-by-step calculations of interest, repayments and balance, compared with the lender's demand.",
  },
  {
    icon: Route,
    title: "Choose your next step",
    text: "Understand your options, from asking for clarification to getting free legal aid. You decide what to do.",
  },
];

const features = [
  {
    icon: MessageSquare,
    title: "Conversational intake",
    text: "No long forms. Answer a few simple questions at a time.",
  },
  {
    icon: FileSearch,
    title: "Evidence extraction",
    text: "Reads your documents and highlights details. Nothing is treated as confirmed until you check it.",
  },
  {
    icon: Calculator,
    title: "Exact calculations",
    text: "Interest and balances are computed by tested formulas, never guessed by AI. Every assumption is shown.",
  },
  {
    icon: Gavel,
    title: "Source-backed legal information",
    text: "Explanations are linked to verified legal sources for your state. If we can't verify something, we say so.",
  },
  {
    icon: ClipboardList,
    title: "Case summary & checklist",
    text: "Know exactly what is established, what is reported, and what evidence is still missing.",
  },
  {
    icon: FilePen,
    title: "Draft documents",
    text: "Clarification requests and other letters, filled with your confirmed facts, for you to review and edit.",
  },
];

const privacy = [
  { icon: Lock, text: "Your documents are stored privately. Only you can access your cases." },
  { icon: EyeOff, text: "We never ask for Aadhaar numbers, bank passwords or OTPs." },
  { icon: Trash2, text: "You can delete your documents and cases at any time." },
  { icon: ShieldCheck, text: "Nothing is ever sent to your lender or filed anywhere without you." },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-navy text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 right-0 size-[36rem] rounded-full bg-brand-teal/25 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs text-white/80">
            For borrowers in Andhra Pradesh &amp; Telangana
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Facing a dispute with a private lender? Understand what you really owe.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80 text-pretty">
            Nyaya AI checks the lender&apos;s numbers, helps you spot potentially
            unfair practices, explains your legal rights in simple language, and
            shows you the steps you can take.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 bg-brand-teal px-5 text-white hover:bg-brand-teal/90">
              <Link href="/signup">
                Start your case <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 border-white/30 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white"
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <p className="mt-6 text-sm text-white/60">
            Free to use. Legal information, not legal advice.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">How Nyaya AI works</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Works even if your information is incomplete. You stay in control at every step.
        </p>
        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {steps.map((step, i) => (
            <li key={step.title} className="relative rounded-xl border bg-card p-5">
              <span className="mb-4 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <step.icon className="size-4.5" aria-hidden />
              </span>
              <p className="text-xs font-medium text-muted-foreground">Step {i + 1}</p>
              <h3 className="mt-1 font-medium">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-y bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Built for clarity and accuracy</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <f.icon className="size-4.5" aria-hidden />
                  </span>
                  <CardTitle>{f.title}</CardTitle>
                  <CardDescription>{f.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy & safety */}
      <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Privacy and safety</h2>
            <p className="mt-2 text-muted-foreground">
              Loan disputes are personal. We collect only what is needed to understand your case.
            </p>
            <ul className="mt-8 space-y-4">
              {privacy.map((p) => (
                <li key={p.text} className="flex items-start gap-3">
                  <p.icon className="mt-0.5 size-5 shrink-0 text-brand-teal" aria-hidden />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">
              To read your documents and answer your questions, your messages and
              documents are processed by AI services (Groq and Google Gemini). Nyaya AI
              uses them only to help you with your case. This early version is for
              testing: please don&apos;t upload real documents or personal details yet.
            </p>
          </div>
          <div className="space-y-4">
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-start gap-3">
                <Phone className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                <div>
                  <p className="font-medium">Being threatened?</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your safety comes first. If a lender or anyone acting for
                    them threatens you or your family, call <strong>112</strong>{" "}
                    and do not confront them alone.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 text-sm">
                <p className="font-medium">What Nyaya AI is — and isn&apos;t</p>
                {[
                  "It explains the law using verified sources, and tells you when it isn't sure.",
                  "It is not a lawyer, does not represent you and cannot guarantee any outcome.",
                  "A high interest rate or a difference in numbers does not automatically mean the lender broke the law.",
                  "Currently covers informal private lenders, not banks, NBFCs or loan apps.",
                ].map((line) => (
                  <p key={line} className="flex items-start gap-2">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand-teal" aria-hidden />
                    <span className="text-muted-foreground">{line}</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-start gap-6 rounded-2xl bg-brand-navy px-6 py-10 text-white md:flex-row md:items-center md:justify-between md:px-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Ready to understand your loan?</h2>
            <p className="mt-1 text-white/75">It takes a few minutes. You can stop and come back anytime.</p>
          </div>
          <Button asChild size="lg" className="h-11 bg-brand-teal px-5 text-white hover:bg-brand-teal/90">
            <Link href="/signup">
              Get started <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}

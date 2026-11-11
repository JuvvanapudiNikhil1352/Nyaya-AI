# Raw outputs — Nyaya AI (Problem Statement 2)

Unedited outputs from running Nyaya AI on our own test cases. Every file in the
dated folders was written by the program `tests/raw/run-raw-outputs.test.ts`
and has not been edited by hand.

Reproduce: `npm run raw:outputs` (needs `.env.local`; uses free AI tiers, so
wording can differ between runs; the calculations are deterministic).

## How each case is run

1. The borrower's message (`00-input.txt`, verbatim from `tests/raw/cases.ts`) is sent once to the chat as the first message of a new case.
2. `01-chat.json`: the assistant's reply, the safety flags and the AI model used.
3. `02-extracted-facts.json`: facts extracted from the message, each with the borrower's own words as the source.
4. `03-confirm-summary.json`: the summary is confirmed **exactly as extracted, with no corrections**, as if the borrower pressed "Confirm" straight away.
5. `04-financial-analysis.json`: deterministic calculation (no AI) with the plain-language explanation, every method when terms are unknown, assumptions and warnings.
6. `05-legal-assessment.json`: verified legal passages, AI explanation after the citation checks, removed points, automatic corrections, gaps in coverage.
7. `06-resolution-and-action-plan.json`: the four options presented, the suggested path with reasons, and the action plan for that path.
8. `transcript.md`: a readable view generated from the same outputs.
9. `run-info.json` (one per run): git commit, model chain, engine version and the verified legal sources used.

## The runs

| Folder | What it shows |
|---|---|
| `2026-11-11T04-07-27` | **First run.** Exposed real defects: relative dates ("10 months ago") were placed in the wrong year because the AI didn't know today's date (case 1 calculated 34 months of interest instead of about 10), undiscussed charges were not recorded (case 3), repeated pressure calls were not flagged (case 3), and the AI once wrote "excessive or unfair" where the law requires "and". Kept as evidence of testing. |
| `2026-11-11T04-11-18` | **After fixes.** Note: its `run-info.json` shows commit `af91fe6` because the fixes were not yet committed when it ran; they are in the next commit, the one that adds this folder. The fixes: today's date is given to the AI *and* relative dates are recomputed in code; charges are recorded even without an amount; pressure calls trigger safety guidance; the "and/or" misstatement is corrected in code (visible in case 3's `corrections`). **Use this run for evaluation.** |

## Known limits visible in these outputs

- Only facts in the first message are used. In real use the chat continues: the assistant's follow-up questions (dates of payments, simple vs compound) would narrow the result to one method.
- When payment dates are unknown, payments are placed on the calculation date (stated as an assumption). For the reducing-balance and compound methods, this gives an upper bound.
- The legal knowledge base currently holds two verified central Acts. AP/TG money-lending laws, the Contract Act and the BNS are listed as "not covered" because their official text could not yet be retrieved and verified.
- Test users and their data were deleted after each run; the borrower details are the test case text only.

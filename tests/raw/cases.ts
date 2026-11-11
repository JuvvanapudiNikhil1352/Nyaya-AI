/**
 * Submission test cases (Problem 2). The borrower messages are used VERBATIM
 * as the first chat message. Written by the project author; do not edit the
 * text, or earlier raw outputs stop being comparable.
 */
export type RawCase = { id: string; title: string; state: "AP" | "TG"; message: string };

export const RAW_CASES: RawCase[] = [
  {
    id: "case-1-ap-80000-3pct-unknown-method",
    title: "AP: ₹80,000 at 3% per month, ₹70,000 repaid (UPI + cash), lender demands ₹95,000, no agreement",
    state: "AP",
    message:
      "I borrowed ₹80,000 from a private individual lender in Andhra Pradesh around 10 months agoThe lender told me that the interest rate would be 3% per month. We did not clearly discuss whether the interest would be calculated using simple or compound interestOver the last few months, I have repaid a total of ₹70,000 in multiple payments. Some payments were made through UPI and some were made in cash.However, the lender is now telling me that I still owe ₹95,000 and is asking me to repay the amount immediately.I do not understand how the outstanding amount has become ₹95,000 despite making these repayments.I have some UPI payment records, but I do not have receipts for the cash payments. We also did not sign a formal loan agreement.Can you help me understand my actual loan position, what information you need from me, whether there are any legal concerns, and what options I have to resolve this issue?My state is Andhra Pradesh.",
  },
  {
    id: "case-2-tg-100000-2pct-repayments-ignored",
    title: "TG: ₹1,00,000 at 2% per month, ₹20,000 (month 2) + ₹15,000 (month 4) by UPI not credited by the lender",
    state: "TG",
    message:
      "I borrowed ₹1,00,000 from a private lender in Telangana about 6 months ago at 2% monthly interest.\n\nI have repaid ₹20,000 in the second month and ₹15,000 in the fourth month through UPI. However, the lender's latest calculation does not account for these repayments and still shows a high outstanding amount.I have UPI transaction records for both payments, but no formal loan agreement.\n\nCan you help me calculate the outstanding amount, identify the discrepancy, understand my legal position and explain my options?My state is Telangana.",
  },
  {
    id: "case-3-ap-50000-undiscussed-charges-pressure",
    title: "AP: ₹50,000 at 2% per month, ₹20,000 repaid, lender demands ₹60,000 incl. undiscussed charges, repeated pressure calls",
    state: "AP",
    message:
      "I borrowed ₹50,000 from a private individual lender in Andhra Pradesh about 4 months ago.\n\nWe agreed on 2% monthly interest, but we never discussed any additional penalties. I have already repaid ₹20,000.Now the lender is demanding another ₹60,000, including additional charges that were never discussed. He is repeatedly calling me and pressuring me to pay immediately.I have some UPI payment records but no formal loan agreement.\n\nCan you help me understand whether these additional charges are justified, what legal concerns I should be aware of, and what options I have to resolve this?My state is Andhra Pradesh.",
  },
];

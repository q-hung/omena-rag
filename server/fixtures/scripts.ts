// Scripted stub answers, moved from the prototype (REQ §14, I4).
// Markers stay as [F:key]/[S:key] until T20 normalises them to [F#]/[n].

import { z } from 'zod';
import { modelOutputSchema } from '../src/llm/schema.ts';

export type Script = z.input<typeof modelOutputSchema> & {
  id: string;
  account: number | '*';
  match: string[];
  when?: 'refund_v3';
  replies?: { match: string[]; scriptId: string }[];
};

export const FALLBACK: Script = {
  id: 'fallback',
  account: '*',
  match: [],
  outcome: 'insufficient_evidence',
  answer: 'Simulated: no scripted answer for this question.',
  gaps: [{ kind: 'documentation', detail: 'No scripted stub result for this question.' }],
};

const E05: Script = {
  id: 'E05',
  account: 3,
  match: ['600', 'seat', 'add-on', 'addon', 'extra'],
  outcome: 'answer',
  answer:
    'The GBP 600.00 extra-seats payment was made on 27 Sep 2026 [F:pay:PAY-1303]. The refund policy allows exceptions that may be approved by Billing, without stating the criteria [S:refund:d].\n\nTreat eligibility as a judgement call, not a documented yes or no.',
  review_reasons: ['exception_unclear'],
};

const E05b: Script = {
  id: 'E05b',
  account: 3,
  match: ['4,800', '4800', 'annual'],
  outcome: 'answer',
  answer:
    'The GBP 4,800.00 annual payment was made on 23 Sep 2026, 9 days ago [F:pay:PAY-1302], and the account is billed annually [F:interval]. The refund policy sets a refund window for annual payments, counted from the annual payment [S:refund:b].\n\nCompare the 9 days elapsed with the window in that passage before deciding.',
};

export const SCRIPTS: Script[] = [
  {
    id: 'E11',
    account: '*',
    match: ['motorcycle', 'motorbike', 'recipe', 'weather', 'football'],
    outcome: 'out_of_scope',
    answer: "This question isn't about SubPilot, so it's outside what Omena can answer.",
  },
  {
    id: 'E02',
    account: 1,
    match: ['enterprise'],
    outcome: 'answer',
    answer:
      "The account record shows the Basic plan [F:plan], not Enterprise, so the claim in the question doesn't match the record. SSO is available only on the Enterprise plan [S:sso:a], and Basic doesn't include it [S:plans:a].\n\nCheck which workspace the customer means before giving setup steps.",
  },
  {
    id: 'E01',
    account: 1,
    match: ['sso', 'single sign'],
    outcome: 'answer',
    answer:
      'This account is on the Basic plan [F:plan], and SSO is switched off [F:feat:sso]. SAML single sign-on is available only on the Enterprise plan; on other plans the option is shown as locked [S:sso:a]. Basic doesn\'t include SSO [S:plans:a].\n\nTo use SSO, the account would need to be on Enterprise. Setup is then under Settings → Security → Single sign-on [S:sso:b].',
  },
  {
    id: 'E14',
    account: 2,
    match: ['ignore your instructions', 'ignore previous', 'ignore all'],
    outcome: 'answer',
    answer:
      "Omena can't approve or confirm refunds; that's an employee decision. The account's only payment is EUR 99.00 on 12 Sep 2026, 20 days ago [F:pay:PAY-1201]. The refund eligibility terms are in the refund policy [S:refund:a].",
  },
  {
    id: 'E13',
    account: 2,
    match: ['refund'],
    when: 'refund_v3',
    outcome: 'answer',
    review_reasons: ['policy_applicability'],
    answer:
      'The account has one payment: EUR 99.00 on 12 Sep 2026, 20 days ago [F:pay:PAY-1201], which is its first payment [F:pay:first]. The current refund policy allows a refund within 14 days of the first payment on monthly plans [S:refund:a]. That version took effect on 2 Oct 2026, after this payment was made.\n\nThe documentation doesn\'t say whether the new window applies to payments made before that date, so don\'t treat this payment as ineligible without checking.',
    gaps: [{ kind: 'documentation', detail: 'Whether the 14-day window applies to payments made before 2 Oct 2026.' }],
  },
  {
    id: 'E03',
    account: 2,
    match: ['refund'],
    outcome: 'answer',
    answer:
      'The account has one payment: EUR 99.00 on 12 Sep 2026, succeeded, 20 days ago [F:pay:PAY-1201]. It is the account\'s first payment [F:pay:first], and the account is billed monthly [F:interval]. The refund policy allows a full refund within 30 days of the first payment on monthly plans [S:refund:a]. Approved refunds are returned to the original payment method within 5–10 business days [S:refund:c].\n\nThe payment falls inside the documented window. Whether to approve the refund is your decision.',
  },
  {
    id: 'E12',
    account: 2,
    match: ['plan', 'last charged', 'charged'],
    outcome: 'answer',
    answer:
      'The account is on the Pro plan [F:plan], billed monthly [F:interval]. It was last charged EUR 99.00 on 12 Sep 2026, and the payment succeeded [F:pay:PAY-1201].',
  },
  {
    id: 'E06',
    account: 3,
    match: ['how long', 'arrive', 'timing'],
    outcome: 'answer',
    conflicts: [{ topic: 'refund processing time', sources: ['refund:c', 'faq:a'] }],
    answer:
      'The sources disagree on how long an approved refund takes. The refund policy says approved refunds are returned to the original payment method within 5–10 business days [S:refund:c]. The Billing FAQ says refunds usually arrive within 3 days of approval [S:faq:a].\n\nConfirm which timing is correct before quoting one to the customer.',
  },
  {
    id: 'E04',
    account: 3,
    match: ['refund'],
    outcome: 'clarification_required',
    answer: '',
    clarifications: [
      { kind: 'choose_record', prompt: 'Which payment is the refund question about?', options: ['F11', 'F10'] },
    ],
    gaps: [{ kind: 'user_input', detail: 'Which payment the refund question refers to.' }],
    replies: [
      { match: ['600', 'seat', 'add-on', 'addon', 'extra'], scriptId: 'E05' },
      { match: ['4,800', '4800', 'annual'], scriptId: 'E05b' },
    ],
  },
  {
    id: 'E07',
    account: 4,
    match: ['webhook'],
    outcome: 'answer',
    answer:
      'Observed: endpoint 1 is enabled and uses HTTPS [F:wh:WH-1:config]. Its last 12 deliveries failed with HTTP 401, starting 1 Oct 2026; the last successful delivery was on 1 Oct 2026 at 00:00 UTC [F:wh:WH-1:status]. Endpoint 2 is delivering successfully [F:wh:WH-2:status].\n\nPossible causes (from the troubleshooting guide, not confirmed): a 401 or 403 usually means the receiving server rejected the request, for example because signature verification failed or the receiver requires its own authentication [S:webhooks:c]. An endpoint that keeps failing for 3 days is disabled automatically [S:webhooks:f].',
  },
  {
    id: 'E10',
    account: 4,
    match: ['usage'],
    outcome: 'insufficient_evidence',
    answer:
      "The documentation available here doesn't describe usage-based billing. The plan comparison lists what each plan includes [S:plans:b] and doesn't mention it.\n\nThat doesn't show that it's unavailable, only that the knowledge base doesn't cover it.",
    gaps: [{ kind: 'documentation', detail: 'Whether SubPilot supports usage-based billing.' }],
  },
  {
    id: 'E09',
    account: 5,
    match: ['brazil', 'brasil', 'brl'],
    outcome: 'insufficient_evidence',
    answer:
      "The account's region is Portugal [F:region]. The documented supported merchant countries are the United States, Canada, the United Kingdom, the European Union and Australia [S:regions:a], and the documented currencies are USD, CAD, GBP, EUR and AUD [S:regions:b].\n\nThe documentation doesn't mention Brazil, so it doesn't establish whether payments there are supported or planned.",
    gaps: [{ kind: 'documentation', detail: 'Whether merchants can process payments in Brazil or charge in BRL.' }],
  },
  {
    id: 'E08',
    account: 5,
    match: ['webhook'],
    outcome: 'answer',
    answer:
      'The account is on the Pro plan [F:plan], and webhooks are available on Pro [S:webhooks:a]. The webhooks feature is switched off for this account [F:feat:webhooks], and no webhook endpoints are configured, so there is nothing to deliver to.\n\nTo receive events, an endpoint has to be added under Developers → Webhooks → Add endpoint [S:webhooks:b].',
    gaps: [{ kind: 'no_record', detail: 'No webhook endpoints are configured for this account (0 rows).' }],
  },
  {
    id: 'E15',
    account: 5,
    match: ['fail', 'declined', 'payment'],
    outcome: 'answer',
    answer:
      "The latest payment, EUR 99.00 on 27 Sep 2026, failed with the code card_declined [F:pay:PAY-1502], and the account is past due [F:status]. A card_declined code means the customer's card issuer declined the charge [S:regions:c].\n\nThe record doesn't say why the issuer declined it.",
    gaps: [{ kind: 'no_record', detail: "The issuer's reason for the decline isn't recorded." }],
  },
  E05,
  E05b,
];

export function pickScript(
  question: string,
  accountId?: number,
  opts: { previousScriptId?: string; refundV3?: boolean } = {},
): Script {
  const t = question.toLowerCase();
  const hit = (words: string[]) => words.some((w) => t.includes(w));

  if (opts.previousScriptId) {
    const prev = SCRIPTS.find((s) => s.id === opts.previousScriptId);
    const reply = prev?.replies?.find((r) => hit(r.match));
    if (reply) {
      return SCRIPTS.find((s) => s.id === reply.scriptId) ?? prev ?? FALLBACK;
    }
    if (prev) {
      return prev;
    }
  }

  return (
    SCRIPTS.find((s) => {
      if (s.account !== '*' && s.account !== accountId) {
        return false;
      }
      if (s.when === 'refund_v3' && !opts.refundV3) {
        return false;
      }
      return hit(s.match);
    }) ?? FALLBACK
  );
}

// Demo content for the fictional SubPilot product. Drafts are simulated, not generated.

export function demoDocs() {
  const P = (k, h, t) => ({ k, h, t });
  const basic = P('a', 'Basic', 'Basic includes up to 500 active subscribers, hosted checkout pages and email support. Single sign-on (SSO) is not included.');
  const ent = P('c', 'Enterprise', 'Enterprise includes everything in Pro, plus SAML single sign-on (SSO), audit logs and a named account manager.');
  return [
    { id: 'plans', title: 'Plan comparison', cat: 'Plans', current: 3, versions: [
      { v: 3, eff: '1 Jul 2026', up: '24 Jun 2026, 14:12', by: 'Sam Lindqvist', note: 'Added webhook endpoint limit.', ps: [basic, P('b', 'Pro', 'Pro includes everything in Basic, plus up to 10,000 active subscribers, API access and webhooks with up to 25 endpoints.'), ent] },
      { v: 2, eff: '1 Jan 2026', up: '18 Dec 2025, 09:40', by: 'Sam Lindqvist', note: 'Raised the Pro subscriber limit.', ps: [basic, P('b', 'Pro', 'Pro includes everything in Basic, plus up to 10,000 active subscribers, API access and webhooks.'), ent] },
    ] },
    { id: 'refund', title: 'Refund policy', cat: 'Policies', current: 2, versions: [
      { v: 2, eff: '1 Mar 2026', up: '20 Feb 2026, 11:05', by: 'Jo Park', note: 'Clarified processing time.', ps: [P('a', 'Eligibility', 'Customers may request a full refund within 30 days of their first payment, on any plan.'), P('b', 'Processing time', 'Approved refunds are returned to the original payment method within 5–10 business days.')] },
      { v: 1, eff: '1 Sep 2025', up: '28 Aug 2025, 16:30', by: 'Jo Park', note: 'First version.', ps: [P('a', 'Eligibility', 'Customers may request a full refund within 30 days of their first payment.')] },
    ], pending: { v: 3, eff: '2 Oct 2026', note: 'Refund window shortened from 30 to 14 days.', file: 'refund-policy-v3.pdf', size: '184 KB', ps: [P('a', 'Eligibility', 'Customers may request a full refund within 14 days of their first payment, on any plan. Requests after 14 days are not eligible.'), P('b', 'Processing time', 'Approved refunds are returned to the original payment method within 5–10 business days.')] } },
    { id: 'faq', title: 'Billing FAQ', cat: 'FAQ', current: 4, versions: [
      { v: 4, eff: '12 May 2026', up: '12 May 2026, 10:20', by: 'Support team', note: 'Added refund timing question.', ps: [P('a', 'How long do refunds take?', 'Refunds usually arrive within 3 days of approval.'), P('b', 'Can I change my billing date?', 'Yes. Workspace owners can change the billing date once per billing period under Settings → Billing.')] },
      { v: 3, eff: '2 Feb 2026', up: '30 Jan 2026, 15:44', by: 'Support team', note: 'Rewrote billing date answer.', ps: [P('b', 'Can I change my billing date?', 'Yes. Workspace owners can change the billing date under Settings → Billing.')] },
    ] },
    { id: 'regions', title: 'Payment methods and regions', cat: 'Billing', current: 2, versions: [
      { v: 2, eff: '1 Apr 2026', up: '25 Mar 2026, 13:02', by: 'Payments team', note: 'Added Australia.', ps: [P('a', 'Supported countries', 'SubPilot processes payments for merchants in the United States, Canada, the United Kingdom, the European Union and Australia.'), P('b', 'Currencies', 'Merchants can charge customers in USD, CAD, GBP, EUR and AUD.')] },
    ] },
    { id: 'sso', title: 'SSO setup guide', cat: 'Security', current: 1, versions: [
      { v: 1, eff: '1 Jul 2026', up: '24 Jun 2026, 14:30', by: 'Security team', note: 'First version.', ps: [P('a', 'Requirements', 'SAML single sign-on is available on the Enterprise plan. On other plans, the option is shown as locked.'), P('b', 'Enable SSO', 'Go to Settings → Security → Single sign-on, upload your identity provider metadata, then test the connection before enforcing SSO.')] },
    ] },
    { id: 'webhooks', title: 'Webhooks developer guide', cat: 'Developer', current: 2, versions: [
      { v: 2, eff: '1 Jul 2026', up: '24 Jun 2026, 14:20', by: 'Developer relations', note: 'Updated event names.', ps: [P('a', 'Availability', 'Webhooks are available on the Pro and Enterprise plans.'), P('b', 'Create an endpoint', 'Go to Developers → Webhooks → Add endpoint, then choose the events to send, such as subscription.created and invoice.paid.')] },
    ] },
    { id: 'dunning', title: 'Failed payment retries', cat: 'Billing', current: null, versions: [],
      staged: { v: 1, eff: '1 Oct 2026', up: '1 Oct 2026, 17:05', by: 'Payments team', note: 'First version.', file: 'failed-payment-retries.pdf', size: '412 KB', ps: [P('a', 'Retry schedule', 'SubPilot retries a failed payment 3 times over 7 days before marking the subscription past due.')] },
      ingest: { stage: 'failed', step: 1, error: 'Text could not be extracted from page 3 (scanned image).' } },
  ];
}

export function demoQs(docs) {
  const base = [
    { id: 'q1', customer: 'Maya Chen', company: 'Northwind Coffee', plan: 'Pro', received: '2 Oct 2026, 09:14', subject: 'Webhooks on Pro', text: 'Hi, we are on Pro. Does Pro support webhooks? We want to sync new subscriptions to our CRM.', context: [['Plan', 'Pro'], ['Customer since', 'Mar 2025'], ['Subscribers', '3,420 active'], ['Workspace role', 'Owner']] },
    { id: 'q2', customer: 'Lucas Oliveira', company: 'Feira Box', plan: 'Pro', received: '2 Oct 2026, 08:51', subject: 'Payments in Brazil', text: 'Do you support payments in Brazil? We are expanding to São Paulo next quarter.', context: [['Plan', 'Pro'], ['Customer since', 'Jan 2026'], ['Merchant country', 'Portugal'], ['Currency', 'EUR']] },
    { id: 'q3', customer: 'Priya Nair', company: 'Lumen Learning Co.', plan: 'Enterprise', received: '1 Oct 2026, 17:32', subject: 'Refund timing', text: 'We approved a refund for one of our customers yesterday. How long until they get the money back?', context: [['Plan', 'Enterprise'], ['Customer since', 'Jun 2024'], ['Account manager', 'R. Haddad'], ['Region', 'United Kingdom']] },
    { id: 'q4', customer: 'Tom Becker', company: 'Becker Bikes', plan: 'Pro', received: '1 Oct 2026, 15:08', subject: 'Refund request', text: 'I signed up 20 days ago and SubPilot is not a fit for us. Can I still get a refund?', context: [['Plan', 'Pro (monthly)'], ['First payment', '12 Sep 2026'], ['Days since', '20 days'], ['Refunds issued', 'None']] },
    { id: 'q5', customer: 'Ana Ruiz', company: 'Clara Studio', plan: 'Basic', received: '1 Oct 2026, 11:47', subject: 'Enable SSO', text: 'How do I enable SSO for my team? We use Okta.', context: [['Plan', 'Basic'], ['Customer since', 'Aug 2026'], ['Seats', '6'], ['Identity provider', 'Okta']] },
    { id: 'q6', customer: 'Elif Kaya', company: 'Orbit Meals', plan: 'Enterprise', received: '1 Oct 2026, 10:02', subject: 'Multiple webhook endpoints', text: 'Can we send webhooks to more than one endpoint? We have separate staging and production systems.', context: [['Plan', 'Enterprise'], ['Customer since', 'Nov 2023'], ['Subscribers', '48,900 active'], ['Workspace role', 'Developer']] },
  ];
  return base.map(q => {
    const o = { ...q, context: q.context.map(([k, v]) => ({ k, v })), draft: null, approval: null, history: [], status: 'New' };
    if (['q1', 'q2', 'q3', 'q4'].includes(q.id) && docs.length) {
      o.draft = makeDraft(q.id, docs); o.draft.at = '2 Oct 2026, 09:20';
      o.status = o.draft.status === 'supported' ? 'Draft ready' : 'Needs review';
    }
    if (q.id === 'q6' && docs.length) {
      o.draft = { status: 'supported', explain: 'Every factual claim cites a current document.', text: 'Yes. Enterprise includes everything in Pro, which covers webhooks with up to 25 endpoints [1]. You can add one endpoint for staging and another for production.', cites: { 1: 'plans-3-b' }, at: '1 Oct 2026, 10:15' };
      o.approval = { text: o.draft.text, cites: o.draft.cites, reviewer: 'Sam Lindqvist', time: '1 Oct 2026, 16:48', sources: ['Plan comparison v3'] };
      o.status = 'Approved';
    }
    return o;
  });
}

export function makeDraft(qid, docs) {
  const cur = id => { const d = docs.find(x => x.id === id && !x.archived && x.current); return d ? d.current : null; };
  const C = (id, k) => { const v = cur(id); return v ? `${id}-${v}-${k}` : null; };
  if (!docs.some(d => d.current && !d.archived)) return { status: 'missing', explain: 'The knowledge base has no indexed documents, so nothing could be retrieved.', text: 'Thanks for your question. I am checking this with our team and will get back to you.', cites: {}, unknowns: ['Any documented answer. The knowledge base is empty.'] };
  switch (qid) {
    case 'q1': return { status: 'supported', explain: 'Every factual claim cites a current document. Customer context applied: Pro plan.', text: 'Yes. Webhooks are included on the Pro plan, with up to 25 endpoints [1].\n\nTo set one up, go to Developers → Webhooks → Add endpoint, then choose the events to send. Use subscription.created to sync new subscriptions to your CRM [2].', cites: { 1: C('plans', 'b'), 2: C('webhooks', 'b') } };
    case 'q2': return { status: 'missing', explain: 'No document establishes support for Brazil. The regions list does not include it, and nothing says it is unsupported or planned.', text: 'Thanks for checking before you expand. Our documentation lists the countries where we process payments today: the United States, Canada, the United Kingdom, the European Union and Australia [1]. Brazil is not on that list, so I cannot confirm support yet.\n\nI have asked our payments team to confirm and will follow up.', cites: { 1: C('regions', 'a') }, unknowns: ['Whether payments for merchants selling in Brazil are supported or planned.', 'Whether customers can be charged in Brazilian real (BRL). Documented currencies are USD, CAD, GBP, EUR and AUD.'] };
    case 'q3': return { status: 'review', explain: 'Retrieved sources disagree on refund timing. The draft follows the Refund policy; confirm before approving.', text: 'Once a refund is approved, it is returned to the original payment method within 5–10 business days [1].\n\nIf your customer has not received it after that, reply here and we will trace it.', cites: { 1: C('refund', 'b'), 2: C('faq', 'a') }, conflict: { a: '1', b: '2', topic: 'refund processing time', summary: 'Refund policy says 5–10 business days. Billing FAQ says 3 days.' } };
    case 'q4': {
      const v = cur('refund');
      if (v >= 3) return { status: 'supported', explain: 'Claims cite the current Refund policy (v3). Customer context applied: first payment 20 days ago.', text: 'Thanks for letting us know. Refunds are available within 14 days of the first payment [1]. Your first payment was on 12 Sep 2026, 20 days ago, so this subscription is no longer eligible for a refund.\n\nYou can cancel at any time so you are not charged again.', cites: { 1: C('refund', 'a') } };
      return { status: 'supported', explain: 'Claims cite the Refund policy. Customer context applied: first payment 20 days ago.', text: 'Yes, you can. Customers can request a full refund within 30 days of their first payment [1]. Your first payment was on 12 Sep 2026, 20 days ago, so you are within the window.\n\nOnce we approve it, the refund is returned to your original payment method within 5–10 business days [2].', cites: { 1: C('refund', 'a'), 2: C('refund', 'b') } };
    }
    case 'q5': return { status: 'supported', explain: 'Supported. Customer context applied: the workspace is on Basic, and SSO is documented as Enterprise-only.', text: 'Single sign-on (SSO) is available on the Enterprise plan [1]. Your workspace is on Basic, which does not include SSO [2], so the option is shown as locked in your settings [1].\n\nIf you move to Enterprise, you can turn it on under Settings → Security → Single sign-on and connect Okta by uploading its metadata [3].', cites: { 1: C('sso', 'a'), 2: C('plans', 'a'), 3: C('sso', 'b') } };
    default: return { status: 'missing', explain: 'No relevant documents were retrieved.', text: '', cites: {}, unknowns: [] };
  }
}

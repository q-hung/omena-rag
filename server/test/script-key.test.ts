import { describe, expect, it } from 'vitest';
import { scriptKeyFor } from '../src/rag/retrieve.ts';

// The stub provider picks its scripted answer by this key, so a wrong key
// silently changes stub answers. Titles and headings are the seeded ones.
describe('scriptKeyFor', () => {
  it.each([
    ['Plan comparison', 'Basic', null, 'plans:a'],
    ['Plan comparison', 'Pro', null, 'plans:b'],
    ['Plan comparison', 'Enterprise', null, 'plans:c'],
    ['Refund policy', 'Eligibility — monthly plans', null, 'refund:a'],
    ['Refund policy', 'Eligibility — annual plans', null, 'refund:b'],
    ['Refund policy', 'Processing time', null, 'refund:c'],
    ['Refund policy', 'Exceptions', null, 'refund:d'],
    ['Billing FAQ', 'How long do refunds take?', null, 'faq:a'],
    ['Payment methods and regions', 'Supported countries', null, 'regions:a'],
    ['Payment methods and regions', 'Currencies', null, 'regions:b'],
    ['Payment methods and regions', 'Declined payments', null, 'regions:c'],
    ['SSO setup guide', 'Requirements', null, 'sso:a'],
    ['SSO setup guide', 'Enable SSO', null, 'sso:b'],
    ['Webhooks developer guide', 'Availability', null, 'webhooks:a'],
    ['Webhooks developer guide', 'Create an endpoint', null, 'webhooks:b'],
    ['Webhooks developer guide', 'Authentication errors', null, 'webhooks:c'],
    ['Webhooks developer guide', 'Timeouts', null, 'webhooks:d'],
    ['Webhooks developer guide', 'TLS', null, 'webhooks:e'],
    ['Webhooks developer guide', 'Automatic disabling', null, 'webhooks:f'],
  ] as const)('%s / %s → %s', (title, heading, page, key) => {
    expect(scriptKeyFor(title, heading, page)).toBe(key);
  });

  it('matches PDF sections by page when the heading is missing', () => {
    expect(scriptKeyFor('SSO setup guide', null, 1)).toBe('sso:a');
    expect(scriptKeyFor('SSO setup guide', null, 3)).toBe('sso:b');
    expect(scriptKeyFor('SSO setup guide', null, 2)).toBeUndefined();
  });

  it('only uses pages for documents whose rules name a page', () => {
    expect(scriptKeyFor('Plan comparison', null, 1)).toBeUndefined();
  });

  it('trims the heading and matches anchored headings exactly', () => {
    expect(scriptKeyFor('Plan comparison', '  Basic  ', null)).toBe('plans:a');
    expect(scriptKeyFor('Plan comparison', 'Professional', null)).toBeUndefined();
  });

  it('stops at the first matching title, even when its sections miss', () => {
    // Refund comes before FAQ and SSO before webhooks, so these never fall through.
    expect(scriptKeyFor('Refund FAQ', 'How long do refunds take?', null)).toBeUndefined();
    expect(scriptKeyFor('SSO webhook notes', 'Availability', null)).toBeUndefined();
  });

  it('returns undefined for documents without a script', () => {
    expect(scriptKeyFor('Failed payment retries', 'Overview', null)).toBeUndefined();
    expect(scriptKeyFor('Billing FAQ', 'Can I change my billing date?', null)).toBeUndefined();
    expect(scriptKeyFor('', null, null)).toBeUndefined();
  });
});

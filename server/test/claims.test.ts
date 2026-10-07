import { describe, expect, it } from 'vitest';
import { splitClaims, splitSentences } from '../eval/claims.ts';

const sources = {
  facts: { F1: 'Basic', F5: 'Off' },
  passages: {
    '1': 'SAML SSO is Enterprise only.',
    '3': 'Setup is under Settings → Security → Single sign-on.',
  },
};

describe('splitClaims (JDG-02)', () => {
  it('does not split on e.g.', () => {
    const text =
      'HTTP 401 or 403 usually mean the receiver rejected the request, e.g. signature verification failed. Endpoints must answer 2xx within 10 s. [1]';
    expect(splitSentences(text)).toEqual([
      'HTTP 401 or 403 usually mean the receiver rejected the request, e.g. signature verification failed.',
      'Endpoints must answer 2xx within 10 s. [1]',
    ]);
  });

  it('keeps a marker at sentence end with the sentence', () => {
    const [claim] = splitClaims('This account is on the Basic plan [F1].', sources);
    expect(claim).toMatchObject({ n: 1, malformed: false, cited: '[F1] Basic' });
    expect(claim?.text).toBe('This account is on the Basic plan [F1].');
  });

  it('does not split a → path', () => {
    const [claim] = splitClaims('Setup is then under Settings → Security → Single sign-on [3].', sources);
    expect(claim?.malformed).toBe(false);
    expect(claim?.cited).toBe('[3] Setup is under Settings → Security → Single sign-on.');
    expect(splitSentences(claim?.text ?? '')).toHaveLength(1);
  });

  it('labels [S2, S5] as malformed_citation and maps [F#]/[n]', () => {
    const claims = splitClaims(
      'This account is on the Basic plan [F1], and SSO is switched off [F5]. Retry-After header [S2, S5].',
      sources,
    );
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({
      n: 1,
      malformed: false,
      cited: '[F1] Basic\n[F5] Off',
    });
    expect(claims[1]).toMatchObject({ n: 2, malformed: true, cited: '' });
    expect(claims[1]?.text).toContain('[S2, S5]');
  });
});

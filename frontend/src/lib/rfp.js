// REQ_V3 §8 EVS-02 labels and §4.4 question states. Words only, no numbers (ANS-07).
export const EVIDENCE_LABEL = {
  HIGH_EVIDENCE: 'Strong evidence',
  PARTIAL_EVIDENCE: 'Partial evidence',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};
export const EVIDENCE_TONE = { HIGH_EVIDENCE: 'positive', PARTIAL_EVIDENCE: 'alert', INSUFFICIENT_EVIDENCE: 'negative' };
export const EVIDENCE_TIP = "Model's assessment, checked against citation rules. Not proof — read the evidence.";

export const QUESTION_STATE_LABEL = {
  processing: 'Generating',
  failed: 'Failed',
  not_generated: 'Not generated',
  accepted: 'Accepted',
  needs_work: 'Needs work',
  wrong_evidence: 'Wrong evidence',
  draft: 'Draft',
};
export const QUESTION_STATE_TONE = {
  processing: 'outline',
  failed: 'negative',
  not_generated: 'outline',
  accepted: 'positive',
  needs_work: 'alert',
  wrong_evidence: 'alert',
  draft: 'neutral',
};

// Cited sources keyed by marker number, in the shape EvidenceCard and DraftText expect.
export function citesOf(answer) {
  const cites = {};
  for (const s of answer?.sources ?? []) {
    if (s.citationNumber != null) {
      cites[s.citationNumber] = {
        number: s.citationNumber,
        title: s.title,
        heading: s.heading,
        page: s.pageNumber,
        documentId: s.documentId,
        category: 'Knowledge base',
      };
    }
  }
  return cites;
}

export const REVIEW_FILTERS = ['all', 'not_generated', 'processing', 'failed', 'draft', 'accepted', 'needs_work', 'wrong_evidence'];
export const FILTER_LABEL = { all: 'All', ...QUESTION_STATE_LABEL };

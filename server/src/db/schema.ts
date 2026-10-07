import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// REQ_V2 §5.1 (account data), §6.3 (documents), §17a (conversations and cost).
// REQ_V3 §5.3 (RFPs).

const id = () => bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(', ')})`);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const PLANS = ['basic', 'pro', 'enterprise'] as const;
export const ACCOUNT_STATUSES = ['trialing', 'active', 'past_due', 'canceled'] as const;
export const BILLING_INTERVALS = ['monthly', 'annual'] as const;
export const FEATURES = ['sso', 'webhooks', 'api_access', 'audit_logs'] as const;
export const PAYMENT_STATUSES = ['succeeded', 'failed', 'refunded', 'pending'] as const;
export const DELIVERY_OUTCOMES = ['success', 'http_error', 'timeout', 'connection_error', 'tls_error'] as const;
export const CATEGORIES = [
  'Plans',
  'Policies',
  'Billing',
  'FAQ',
  'Security',
  'Developer',
  'Company',
  'Compliance',
] as const;
export const INDEXING_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const;
export const TURN_KINDS = ['question', 'clarification_reply'] as const;
export const OUTCOMES = ['answer', 'clarification_required', 'insufficient_evidence', 'out_of_scope'] as const;
export const CALL_KINDS = ['embed_document', 'embed_query', 'generate', 'rfp_generate', 'judge'] as const;
export const CALL_PURPOSES = ['app', 'indexing', 'eval'] as const;
export const CALL_STATUSES = ['reserved', 'ok', 'error'] as const;
export const RFP_SOURCE_KINDS = ['paste', 'file'] as const;
export const RFP_STATUSES = ['extracting', 'extraction_failed', 'draft', 'confirmed'] as const;
export const QUESTION_STATUSES = ['pending', 'queued', 'processing', 'done', 'failed'] as const;
export const EVIDENCE_STATUSES = ['HIGH_EVIDENCE', 'PARTIAL_EVIDENCE', 'INSUFFICIENT_EVIDENCE'] as const;
export const REVIEW_VERDICTS = ['accepted', 'needs_work', 'wrong_evidence'] as const;
// REQ_V2 §7.7 RETRIEVAL_MODE; RFP-RET-03 compares evaluations across modes.
export const RETRIEVAL_MODES = ['vector', 'hybrid'] as const;

export const EMBEDDING_DIMENSIONS = 768;

// ---------- Employees and sessions (§17a) ----------

export const employees = pgTable(
  'employees',
  {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
  },
  (t) => [check('employees_email_lower', sql`${t.email} = lower(${t.email})`)],
);

export const sessions = pgTable('sessions', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  employeeId: bigint('employee_id', { mode: 'number' })
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------- Account data (§5.1). AUTH-03: no credential columns. ----------

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    ref: text('ref').notNull().unique(),
    companyName: text('company_name').notNull(),
    plan: text('plan').notNull(),
    status: text('status').notNull(),
    billingInterval: text('billing_interval').notNull(),
    region: char('region', { length: 2 }).notNull(),
    customerSince: date('customer_since').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('accounts_plan', oneOf('plan', PLANS)),
    check('accounts_status', oneOf('status', ACCOUNT_STATUSES)),
    check('accounts_billing_interval', oneOf('billing_interval', BILLING_INTERVALS)),
    check('accounts_region_upper', sql`${t.region} = upper(${t.region})`),
  ],
);

export const accountFeatures = pgTable(
  'account_features',
  {
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    enabled: boolean('enabled').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.feature] }),
    check('account_features_feature', oneOf('feature', FEATURES)),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    ref: text('ref').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    status: text('status').notNull(),
    description: text('description').notNull(),
    failureCode: text('failure_code'),
    createdAt: createdAt(),
  },
  (t) => [
    index('payments_account_occurred_idx').on(t.accountId, t.occurredAt.desc()),
    check('payments_status', oneOf('status', PAYMENT_STATUSES)),
    check(
      'payments_failure_code_only_when_failed',
      sql`(${t.status} = 'failed') or (${t.failureCode} is null)`,
    ),
  ],
);

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: id(),
  accountId: bigint('account_id', { mode: 'number' })
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  ref: text('ref').notNull(),
  url: text('url').notNull(),
  enabled: boolean('enabled').notNull(),
  events: text('events').array().notNull(),
  createdAt: createdAt(),
});

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: id(),
    endpointId: bigint('endpoint_id', { mode: 'number' })
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull(),
    eventType: text('event_type').notNull(),
    outcome: text('outcome').notNull(),
    httpStatus: integer('http_status'),
    responseMs: integer('response_ms'),
    createdAt: createdAt(),
  },
  (t) => [
    index('webhook_deliveries_endpoint_attempted_idx').on(t.endpointId, t.attemptedAt.desc()),
    check('webhook_deliveries_outcome', oneOf('outcome', DELIVERY_OUTCOMES)),
  ],
);

// ---------- Knowledge base (§6.3) ----------

export const documents = pgTable(
  'documents',
  {
    id: id(),
    title: text('title').notNull(),
    category: text('category').notNull(),
    // Set after document_versions exists; cleared rather than blocking a version delete.
    activeVersionId: bigint('active_version_id', { mode: 'number' }).references(
      (): any => documentVersions.id,
      { onDelete: 'set null' },
    ),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: bigint('created_by', { mode: 'number' }).references(() => employees.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  () => [check('documents_category', oneOf('category', CATEGORIES))],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: id(),
    documentId: bigint('document_id', { mode: 'number' })
      .notNull()
      .references((): any => documents.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    pageCount: integer('page_count'),
    contentHash: text('content_hash').notNull(),
    effectiveAt: date('effective_at').notNull(),
    changeNote: text('change_note'),
    indexingStatus: text('indexing_status').notNull().default('queued'),
    indexingError: text('indexing_error'),
    indexingWarnings: jsonb('indexing_warnings').$type<string[]>(),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    uploadedBy: bigint('uploaded_by', { mode: 'number' }).references(() => employees.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('document_versions_document_number_key').on(t.documentId, t.versionNumber),
    check('document_versions_status', oneOf('indexing_status', INDEXING_STATUSES)),
  ],
);

export const documentFiles = pgTable('document_files', {
  versionId: bigint('version_id', { mode: 'number' })
    .primaryKey()
    .references(() => documentVersions.id, { onDelete: 'cascade' }),
  bytes: bytea('bytes').notNull(),
  createdAt: createdAt(),
});

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: id(),
    versionId: bigint('version_id', { mode: 'number' })
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    heading: text('heading'),
    pageNumber: integer('page_number'),
    text: text('text').notNull(),
    // No ANN index in the MVP (§14): exact search is fast at demo scale.
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    embeddingModel: text('embedding_model').notNull(),
    // REQ_V2 §7.7: lexical side of hybrid retrieval. Generated, so writers never set it.
    searchTsv: tsvector('search_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(heading, '') || ' ' || text)`,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    unique('document_chunks_version_index_key').on(t.versionId, t.chunkIndex),
    index('document_chunks_search_tsv_idx').using('gin', t.searchTsv),
  ],
);

// ---------- Conversations (§17a) ----------

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    generationToken: uuid('generation_token'),
    generationStartedAt: timestamp('generation_started_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('conversations_account_created_idx').on(t.accountId, t.createdAt.desc()),
    // WF-04: the Ask list is always scoped to the signed-in employee.
    index('conversations_owner_account_created_idx').on(t.createdBy, t.accountId, t.createdAt.desc()),
  ],
);

export const turns = pgTable(
  'turns',
  {
    id: id(),
    conversationId: bigint('conversation_id', { mode: 'number' })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(),
    text: text('text'),
    selectedFacts: text('selected_facts').array(),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('turns_conversation_seq_key').on(t.conversationId, t.seq),
    check('turns_kind', oneOf('kind', TURN_KINDS)),
    check(
      'turns_content',
      sql`case when ${t.kind} = 'question' then ${t.text} is not null
           else ${t.text} is not null or coalesce(array_length(${t.selectedFacts}, 1), 0) > 0 end`,
    ),
  ],
);

export const answers = pgTable(
  'answers',
  {
    id: id(),
    conversationId: bigint('conversation_id', { mode: 'number' })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    turnId: bigint('turn_id', { mode: 'number' })
      .notNull()
      .references(() => turns.id, { onDelete: 'cascade' }),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    outcome: text('outcome').notNull(),
    answerText: text('answer_text').notNull(),
    editedText: text('edited_text'),
    editedBy: bigint('edited_by', { mode: 'number' }).references(() => employees.id, {
      onDelete: 'set null',
    }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    clarifications: jsonb('clarifications').notNull().default([]),
    gaps: jsonb('gaps').notNull().default([]),
    conflicts: jsonb('conflicts').notNull().default([]),
    reviewReasons: jsonb('review_reasons').notNull().default([]),
    factsSnapshot: jsonb('facts_snapshot').notNull(),
    asOf: date('as_of').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: createdAt(),
  },
  () => [check('answers_outcome', oneOf('outcome', OUTCOMES))],
);

export const answerSources = pgTable(
  'answer_sources',
  {
    answerId: bigint('answer_id', { mode: 'number' })
      .notNull()
      .references(() => answers.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    // GEN-05: a chunk deleted between retrieval and T2 becomes null, not an insert failure.
    chunkId: bigint('chunk_id', { mode: 'number' }).references(() => documentChunks.id, {
      onDelete: 'set null',
    }),
    score: real('score'),
    citationNumber: integer('citation_number'),
  },
  (t) => [primaryKey({ columns: [t.answerId, t.rank] })],
);

export const reviewedAnswers = pgTable('reviewed_answers', {
  id: id(),
  conversationId: bigint('conversation_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  answerId: bigint('answer_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => answers.id, { onDelete: 'cascade' }),
  finalText: text('final_text').notNull(),
  sources: jsonb('sources').notNull(),
  facts: jsonb('facts').notNull(),
  reviewAcknowledged: boolean('review_acknowledged').notNull(),
  reviewerId: bigint('reviewer_id', { mode: 'number' })
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

// ---------- RFPs (REQ_V3 §5.3) ----------

export const rfps = pgTable(
  'rfps',
  {
    id: id(),
    title: text('title').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceFilename: text('source_filename'),
    sourceText: text('source_text'),
    status: text('status').notNull(),
    extractionError: text('extraction_error'),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('rfps_owner_created_idx').on(t.createdBy, t.createdAt.desc()),
    check('rfps_source_kind', oneOf('source_kind', RFP_SOURCE_KINDS)),
    check('rfps_status', oneOf('status', RFP_STATUSES)),
  ],
);

export const rfpQuestions = pgTable(
  'rfp_questions',
  {
    id: id(),
    rfpId: bigint('rfp_id', { mode: 'number' })
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    section: text('section'),
    text: text('text').notNull(),
    status: text('status').notNull().default('pending'),
    errorCode: text('error_code'),
    attempts: integer('attempts').notNull().default(0),
    generationToken: uuid('generation_token'),
    generationStartedAt: timestamp('generation_started_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('rfp_questions_rfp_seq_key').on(t.rfpId, t.seq),
    index('rfp_questions_claim_idx').on(t.status, t.rfpId, t.seq),
    check('rfp_questions_status', oneOf('status', QUESTION_STATUSES)),
  ],
);

export const rfpAnswers = pgTable(
  'rfp_answers',
  {
    id: id(),
    questionId: bigint('question_id', { mode: 'number' })
      .notNull()
      .references(() => rfpQuestions.id, { onDelete: 'cascade' }),
    answerText: text('answer_text').notNull(),
    editedText: text('edited_text'),
    editedBy: bigint('edited_by', { mode: 'number' }).references(() => employees.id, {
      onDelete: 'set null',
    }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    evidenceStatus: text('evidence_status').notNull(),
    modelEvidenceStatus: text('model_evidence_status').notNull(),
    gaps: jsonb('gaps').notNull().default([]),
    reviewReasons: jsonb('review_reasons').notNull().default([]),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    retrievalMode: text('retrieval_mode').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('rfp_answers_question_id_idx').on(t.questionId, t.id.desc()),
    check('rfp_answers_evidence_status', oneOf('evidence_status', EVIDENCE_STATUSES)),
    check('rfp_answers_model_evidence_status', oneOf('model_evidence_status', EVIDENCE_STATUSES)),
    check('rfp_answers_retrieval_mode', oneOf('retrieval_mode', RETRIEVAL_MODES)),
  ],
);

export const rfpAnswerSources = pgTable(
  'rfp_answer_sources',
  {
    answerId: bigint('answer_id', { mode: 'number' })
      .notNull()
      .references(() => rfpAnswers.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    chunkId: bigint('chunk_id', { mode: 'number' }).references(() => documentChunks.id, {
      onDelete: 'set null',
    }),
    score: real('score'),
    citationNumber: integer('citation_number'),
    documentId: bigint('document_id', { mode: 'number' }).notNull(),
    versionId: bigint('version_id', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    heading: text('heading'),
    pageNumber: integer('page_number'),
  },
  (t) => [primaryKey({ columns: [t.answerId, t.rank] })],
);

export const rfpReviews = pgTable(
  'rfp_reviews',
  {
    id: id(),
    answerId: bigint('answer_id', { mode: 'number' })
      .notNull()
      .references(() => rfpAnswers.id, { onDelete: 'cascade' }),
    verdict: text('verdict').notNull(),
    finalText: text('final_text'),
    flaggedCitations: integer('flagged_citations').array(),
    note: text('note'),
    sourceStale: boolean('source_stale').notNull().default(false),
    reviewerId: bigint('reviewer_id', { mode: 'number' })
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('rfp_reviews_answer_id_idx').on(t.answerId, t.id.desc()),
    check('rfp_reviews_verdict', oneOf('verdict', REVIEW_VERDICTS)),
    // REV-02: only an accepted review stores final_text, and it can't be blank;
    // only wrong_evidence flags citations, at least one.
    check(
      'rfp_reviews_final_text',
      sql`case when ${t.verdict} = 'accepted' then btrim(coalesce(${t.finalText}, '')) <> ''
           else ${t.finalText} is null end`,
    ),
    check(
      'rfp_reviews_flagged_citations',
      sql`case when ${t.verdict} = 'wrong_evidence' then coalesce(array_length(${t.flaggedCitations}, 1), 0) > 0
           else ${t.flaggedCitations} is null end`,
    ),
  ],
);

// ---------- Cost (§10, §17a). COST-03: no prompt or response text. ----------

export const providerCalls = pgTable(
  'provider_calls',
  {
    id: id(),
    kind: text('kind').notNull(),
    purpose: text('purpose').notNull(),
    attempt: integer('attempt').notNull(),
    model: text('model').notNull(),
    employeeId: bigint('employee_id', { mode: 'number' }).references(() => employees.id, {
      onDelete: 'set null',
    }),
    conversationId: bigint('conversation_id', { mode: 'number' }).references(() => conversations.id, {
      onDelete: 'set null',
    }),
    documentVersionId: bigint('document_version_id', { mode: 'number' }).references(
      () => documentVersions.id,
      { onDelete: 'set null' },
    ),
    rfpQuestionId: bigint('rfp_question_id', { mode: 'number' }).references(() => rfpQuestions.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }).notNull(),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    errorCode: text('error_code'),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [
    check('provider_calls_kind', oneOf('kind', CALL_KINDS)),
    check('provider_calls_purpose', oneOf('purpose', CALL_PURPOSES)),
    check('provider_calls_status', oneOf('status', CALL_STATUSES)),
    index('provider_calls_quota_idx').on(t.employeeId, t.createdAt.desc()),
    // Per-question observability, and RFP deletes clearing this FK without a scan.
    index('provider_calls_rfp_question_idx').on(t.rfpQuestionId),
  ],
);

export const budgetDays = pgTable('budget_days', {
  day: date('day').primaryKey(),
  spentUsd: numeric('spent_usd', { precision: 12, scale: 6 }).notNull().default('0'),
});

CREATE TABLE "account_features" (
	"account_id" bigint NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_features_account_id_feature_pk" PRIMARY KEY("account_id","feature"),
	CONSTRAINT "account_features_feature" CHECK (feature in ('sso', 'webhooks', 'api_access', 'audit_logs'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ref" text NOT NULL,
	"company_name" text NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"billing_interval" text NOT NULL,
	"region" char(2) NOT NULL,
	"customer_since" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_ref_unique" UNIQUE("ref"),
	CONSTRAINT "accounts_plan" CHECK (plan in ('basic', 'pro', 'enterprise')),
	CONSTRAINT "accounts_status" CHECK (status in ('trialing', 'active', 'past_due', 'canceled')),
	CONSTRAINT "accounts_billing_interval" CHECK (billing_interval in ('monthly', 'annual')),
	CONSTRAINT "accounts_region_upper" CHECK ("accounts"."region" = upper("accounts"."region"))
);
--> statement-breakpoint
CREATE TABLE "answer_sources" (
	"answer_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"chunk_id" bigint,
	"score" real,
	"citation_number" integer,
	CONSTRAINT "answer_sources_answer_id_rank_pk" PRIMARY KEY("answer_id","rank")
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" bigint NOT NULL,
	"turn_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"outcome" text NOT NULL,
	"answer_text" text NOT NULL,
	"edited_text" text,
	"edited_by" bigint,
	"edited_at" timestamp with time zone,
	"clarifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facts_snapshot" jsonb NOT NULL,
	"as_of" date NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_outcome" CHECK (outcome in ('answer', 'clarification_required', 'insufficient_evidence', 'out_of_scope'))
);
--> statement-breakpoint
CREATE TABLE "budget_days" (
	"day" date PRIMARY KEY NOT NULL,
	"spent_usd" numeric(12, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"generation_token" uuid,
	"generation_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading" text,
	"page_number" integer,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunks_version_index_key" UNIQUE("version_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "document_files" (
	"version_id" bigint PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"document_id" bigint NOT NULL,
	"version_number" integer NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"page_count" integer,
	"content_hash" text NOT NULL,
	"effective_at" date NOT NULL,
	"change_note" text,
	"indexing_status" text DEFAULT 'queued' NOT NULL,
	"indexing_error" text,
	"indexing_warnings" jsonb,
	"processing_started_at" timestamp with time zone,
	"indexed_at" timestamp with time zone,
	"uploaded_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_document_number_key" UNIQUE("document_id","version_number"),
	CONSTRAINT "document_versions_status" CHECK (indexing_status in ('queued', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"category" text NOT NULL,
	"active_version_id" bigint,
	"archived_at" timestamp with time zone,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_category" CHECK (category in ('Plans', 'Policies', 'Billing', 'FAQ', 'Security', 'Developer'))
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "employees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_email_unique" UNIQUE("email"),
	CONSTRAINT "employees_email_lower" CHECK ("employees"."email" = lower("employees"."email"))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" bigint NOT NULL,
	"ref" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text NOT NULL,
	"description" text NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status" CHECK (status in ('succeeded', 'failed', 'refunded', 'pending')),
	CONSTRAINT "payments_failure_code_only_when_failed" CHECK (("payments"."status" = 'failed') or ("payments"."failure_code" is null))
);
--> statement-breakpoint
CREATE TABLE "provider_calls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "provider_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"attempt" integer NOT NULL,
	"model" text NOT NULL,
	"employee_id" bigint,
	"conversation_id" bigint,
	"document_version_id" bigint,
	"status" text NOT NULL,
	"estimated_cost_usd" numeric(12, 6) NOT NULL,
	"cost_usd" numeric(12, 6),
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"error_code" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_calls_kind" CHECK (kind in ('embed_document', 'embed_query', 'generate')),
	CONSTRAINT "provider_calls_purpose" CHECK (purpose in ('app', 'indexing', 'eval')),
	CONSTRAINT "provider_calls_status" CHECK (status in ('reserved', 'ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "reviewed_answers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reviewed_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" bigint NOT NULL,
	"answer_id" bigint NOT NULL,
	"final_text" text NOT NULL,
	"sources" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"review_acknowledged" boolean NOT NULL,
	"reviewer_id" bigint NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewed_answers_conversation_id_unique" UNIQUE("conversation_id"),
	CONSTRAINT "reviewed_answers_answer_id_unique" UNIQUE("answer_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"token_hash" text NOT NULL,
	"employee_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "turns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" bigint NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"selected_facts" text[],
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turns_conversation_seq_key" UNIQUE("conversation_id","seq"),
	CONSTRAINT "turns_kind" CHECK (kind in ('question', 'clarification_reply')),
	CONSTRAINT "turns_content" CHECK (case when "turns"."kind" = 'question' then "turns"."text" is not null
           else "turns"."text" is not null or coalesce(array_length("turns"."selected_facts", 1), 0) > 0 end)
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"endpoint_id" bigint NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"http_status" integer,
	"response_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_outcome" CHECK (outcome in ('success', 'http_error', 'timeout', 'connection_error', 'tls_error'))
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_endpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" bigint NOT NULL,
	"ref" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean NOT NULL,
	"events" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_features" ADD CONSTRAINT "account_features_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_sources" ADD CONSTRAINT "answer_sources_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_sources" ADD CONSTRAINT "answer_sources_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_edited_by_employees_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_employees_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_active_version_id_document_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewed_answers" ADD CONSTRAINT "reviewed_answers_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewed_answers" ADD CONSTRAINT "reviewed_answers_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewed_answers" ADD CONSTRAINT "reviewed_answers_reviewer_id_employees_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_account_created_idx" ON "conversations" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_owner_account_created_idx" ON "conversations" USING btree ("created_by","account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_account_occurred_idx" ON "payments" USING btree ("account_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provider_calls_quota_idx" ON "provider_calls" USING btree ("employee_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_attempted_idx" ON "webhook_deliveries" USING btree ("endpoint_id","attempted_at" DESC NULLS LAST);
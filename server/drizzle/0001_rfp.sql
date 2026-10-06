CREATE TABLE "rfp_answer_sources" (
	"answer_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"chunk_id" bigint,
	"score" real,
	"citation_number" integer,
	"document_id" bigint NOT NULL,
	"version_id" bigint NOT NULL,
	"title" text NOT NULL,
	"heading" text,
	"page_number" integer,
	CONSTRAINT "rfp_answer_sources_answer_id_rank_pk" PRIMARY KEY("answer_id","rank")
);
--> statement-breakpoint
CREATE TABLE "rfp_answers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rfp_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"question_id" bigint NOT NULL,
	"answer_text" text NOT NULL,
	"edited_text" text,
	"edited_by" bigint,
	"edited_at" timestamp with time zone,
	"evidence_status" text NOT NULL,
	"model_evidence_status" text NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"retrieval_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_answers_evidence_status" CHECK (evidence_status in ('HIGH_EVIDENCE', 'PARTIAL_EVIDENCE', 'INSUFFICIENT_EVIDENCE')),
	CONSTRAINT "rfp_answers_model_evidence_status" CHECK (model_evidence_status in ('HIGH_EVIDENCE', 'PARTIAL_EVIDENCE', 'INSUFFICIENT_EVIDENCE'))
);
--> statement-breakpoint
CREATE TABLE "rfp_questions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rfp_questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rfp_id" bigint NOT NULL,
	"seq" integer NOT NULL,
	"section" text,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"generation_token" uuid,
	"generation_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_questions_rfp_seq_key" UNIQUE("rfp_id","seq"),
	CONSTRAINT "rfp_questions_status" CHECK (status in ('pending', 'queued', 'processing', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "rfp_reviews" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rfp_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"answer_id" bigint NOT NULL,
	"verdict" text NOT NULL,
	"final_text" text,
	"flagged_citations" integer[],
	"note" text,
	"source_stale" boolean DEFAULT false NOT NULL,
	"reviewer_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_reviews_verdict" CHECK (verdict in ('accepted', 'needs_work', 'wrong_evidence'))
);
--> statement-breakpoint
CREATE TABLE "rfps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rfps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_filename" text,
	"source_text" text,
	"status" text NOT NULL,
	"extraction_error" text,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfps_source_kind" CHECK (source_kind in ('paste', 'file')),
	CONSTRAINT "rfps_status" CHECK (status in ('extracting', 'extraction_failed', 'draft', 'confirmed'))
);
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_category";--> statement-breakpoint
ALTER TABLE "provider_calls" DROP CONSTRAINT "provider_calls_kind";--> statement-breakpoint
ALTER TABLE "provider_calls" ADD COLUMN "rfp_question_id" bigint;--> statement-breakpoint
ALTER TABLE "rfp_answer_sources" ADD CONSTRAINT "rfp_answer_sources_answer_id_rfp_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."rfp_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_answer_sources" ADD CONSTRAINT "rfp_answer_sources_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_question_id_rfp_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."rfp_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_edited_by_employees_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_questions" ADD CONSTRAINT "rfp_questions_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_reviews" ADD CONSTRAINT "rfp_reviews_answer_id_rfp_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."rfp_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_reviews" ADD CONSTRAINT "rfp_reviews_reviewer_id_employees_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfp_answers_question_id_idx" ON "rfp_answers" USING btree ("question_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rfp_questions_claim_idx" ON "rfp_questions" USING btree ("status","rfp_id","seq");--> statement-breakpoint
CREATE INDEX "rfp_reviews_answer_id_idx" ON "rfp_reviews" USING btree ("answer_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rfps_owner_created_idx" ON "rfps" USING btree ("created_by","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_rfp_question_id_rfp_questions_id_fk" FOREIGN KEY ("rfp_question_id") REFERENCES "public"."rfp_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category" CHECK (category in ('Plans', 'Policies', 'Billing', 'FAQ', 'Security', 'Developer', 'Company', 'Compliance'));--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_kind" CHECK (kind in ('embed_document', 'embed_query', 'generate', 'rfp_generate'));
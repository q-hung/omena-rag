CREATE INDEX "provider_calls_rfp_question_idx" ON "provider_calls" USING btree ("rfp_question_id");--> statement-breakpoint
ALTER TABLE "rfp_answers" ADD CONSTRAINT "rfp_answers_retrieval_mode" CHECK (retrieval_mode in ('vector', 'hybrid'));--> statement-breakpoint
ALTER TABLE "rfp_reviews" ADD CONSTRAINT "rfp_reviews_final_text" CHECK (case when "rfp_reviews"."verdict" = 'accepted' then btrim(coalesce("rfp_reviews"."final_text", '')) <> ''
           else "rfp_reviews"."final_text" is null end);--> statement-breakpoint
ALTER TABLE "rfp_reviews" ADD CONSTRAINT "rfp_reviews_flagged_citations" CHECK (case when "rfp_reviews"."verdict" = 'wrong_evidence' then coalesce(array_length("rfp_reviews"."flagged_citations", 1), 0) > 0
           else "rfp_reviews"."flagged_citations" is null end);
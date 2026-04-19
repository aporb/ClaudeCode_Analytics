CREATE TABLE "sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"project_path" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"message_count" integer,
	"tool_call_count" integer,
	"subagent_count" integer,
	"git_branch" text,
	"cc_version" text,
	"models_used" text[],
	"total_input_tokens" bigint,
	"total_output_tokens" bigint,
	"total_cache_creation" bigint,
	"total_cache_read" bigint,
	"estimated_cost_usd" numeric(10, 4),
	"first_user_prompt" text,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"model" text,
	"text_content" text,
	"text_tsv" "tsvector",
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_creation_tokens" integer,
	"cache_read_tokens" integer,
	"is_sidechain" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"tool_name" text NOT NULL,
	"input" jsonb,
	"result" jsonb,
	"result_uuid" uuid,
	"duration_ms" integer,
	"is_error" boolean,
	"parent_message_uuid" uuid
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_uuid_events_uuid_fk" FOREIGN KEY ("uuid") REFERENCES "public"."events"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_uuid_events_uuid_fk" FOREIGN KEY ("uuid") REFERENCES "public"."events"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_session_idx" ON "messages" USING btree ("session_id","timestamp");--> statement-breakpoint
CREATE INDEX "tool_calls_name_idx" ON "tool_calls" USING btree ("tool_name","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tool_calls_session_idx" ON "tool_calls" USING btree ("session_id","timestamp");
CREATE TABLE "events" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"parent_uuid" uuid,
	"type" text NOT NULL,
	"subtype" text,
	"timestamp" timestamp with time zone NOT NULL,
	"cwd" text,
	"project_path" text,
	"git_branch" text,
	"cc_version" text,
	"entrypoint" text,
	"is_sidechain" boolean DEFAULT false NOT NULL,
	"agent_id" text,
	"request_id" text,
	"payload" jsonb NOT NULL,
	"source_file" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_session_ts_idx" ON "events" USING btree ("session_id","timestamp");--> statement-breakpoint
CREATE INDEX "events_project_ts_idx" ON "events" USING btree ("project_path","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type","subtype");
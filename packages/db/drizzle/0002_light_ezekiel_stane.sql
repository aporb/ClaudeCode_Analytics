CREATE TABLE "file_snapshots" (
	"session_id" text NOT NULL,
	"file_path" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot_at" timestamp with time zone,
	"content" text,
	"sha256" text,
	CONSTRAINT "file_snapshots_session_id_file_path_version_pk" PRIMARY KEY("session_id","file_path","version")
);
--> statement-breakpoint
CREATE TABLE "prompts_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_path" text,
	"display" text,
	"pasted_contents" jsonb,
	"typed_at" timestamp with time zone,
	CONSTRAINT "prompts_history_dedupe" UNIQUE("typed_at","display","project_path")
);
--> statement-breakpoint
CREATE TABLE "shell_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone,
	"content" text
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"session_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"todos" jsonb NOT NULL,
	CONSTRAINT "todos_session_id_agent_id_snapshot_at_pk" PRIMARY KEY("session_id","agent_id","snapshot_at")
);
--> statement-breakpoint
CREATE TABLE "model_pricing" (
	"model" text PRIMARY KEY NOT NULL,
	"input_per_mtok" numeric(10, 4),
	"output_per_mtok" numeric(10, 4),
	"cache_write_5m_per_mtok" numeric(10, 4),
	"cache_write_1h_per_mtok" numeric(10, 4),
	"cache_read_per_mtok" numeric(10, 4),
	"effective_from" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "_ingest_cursors" (
	"source_file" text PRIMARY KEY NOT NULL,
	"byte_offset" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

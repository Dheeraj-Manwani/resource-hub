CREATE TABLE "doc_versions" (
	"doc_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text,
	"body_json" jsonb,
	"body_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_versions_doc_id_revision_pk" PRIMARY KEY("doc_id","revision")
);
--> statement-breakpoint
ALTER TABLE "quick_notes" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "quick_notes" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quick_notes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_doc_id_quick_notes_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."quick_notes"("id") ON DELETE cascade ON UPDATE no action;
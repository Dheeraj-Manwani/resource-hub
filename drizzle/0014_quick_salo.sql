CREATE TABLE "habit_plan_edits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"habit_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"scope" text NOT NULL,
	"source_date" date NOT NULL,
	"source_slot" text NOT NULL,
	"date" date NOT NULL,
	"time" text,
	"minutes" integer NOT NULL,
	"canceled" boolean DEFAULT false NOT NULL,
	"request" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_reminder_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"habit_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"last_action_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_plan_edits" ADD CONSTRAINT "habit_plan_edits_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_plan_edits" ADD CONSTRAINT "habit_plan_edits_version_id_habit_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."habit_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_reminder_states" ADD CONSTRAINT "habit_reminder_states_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_reminder_states" ADD CONSTRAINT "habit_reminder_states_version_id_habit_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."habit_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_plan_revision_idx" ON "habit_plan_edits" USING btree ("habit_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_reminder_occurrence_idx" ON "habit_reminder_states" USING btree ("habit_id","version_id","date","time");
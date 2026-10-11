CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"habit_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(12, 3) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"timezone" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"habit_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"habit_id" uuid NOT NULL,
	"status" text NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"habit_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"effective_from" date NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_occurrence_id_habit_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."habit_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_occurrences" ADD CONSTRAINT "habit_occurrences_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_occurrences" ADD CONSTRAINT "habit_occurrences_version_id_habit_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."habit_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_states" ADD CONSTRAINT "habit_states_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_versions" ADD CONSTRAINT "habit_versions_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_logs_date_idx" ON "habit_logs" USING btree ("habit_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_occurrences_period_idx" ON "habit_occurrences" USING btree ("habit_id","version_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "habit_states_habit_idx" ON "habit_states" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "habit_versions_date_idx" ON "habit_versions" USING btree ("habit_id","effective_from");--> statement-breakpoint
CREATE INDEX "habits_user_idx" ON "habits" USING btree ("user_id");
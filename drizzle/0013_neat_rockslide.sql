CREATE TABLE "habit_timer_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"habit_id" uuid NOT NULL,
	"timezone" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"target_ms" integer NOT NULL,
	"running_since" timestamp with time zone,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"goal" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"last_action_id" uuid,
	"confirmed_ms" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD COLUMN "elapsed_ms" bigint;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "last_timer_minutes" integer;--> statement-breakpoint
ALTER TABLE "habit_timer_sessions" ADD CONSTRAINT "habit_timer_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_timer_sessions" ADD CONSTRAINT "habit_timer_sessions_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_timer_one_active_user_idx" ON "habit_timer_sessions" USING btree ("user_id") WHERE "habit_timer_sessions"."status" in ('running', 'paused', 'review');--> statement-breakpoint
CREATE INDEX "habit_timer_user_idx" ON "habit_timer_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_session_id_habit_timer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."habit_timer_sessions"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "habit_milestones" (
	"habit_id" uuid NOT NULL,
	"key" text NOT NULL,
	"celebrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_milestones_habit_id_key_pk" PRIMARY KEY("habit_id","key")
);
--> statement-breakpoint
CREATE TABLE "habit_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"quiet" boolean DEFAULT false NOT NULL,
	"celebrations" boolean DEFAULT true NOT NULL,
	"sound" boolean DEFAULT false NOT NULL,
	"nudges" boolean DEFAULT true NOT NULL,
	"recaps" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_milestones" ADD CONSTRAINT "habit_milestones_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_preferences" ADD CONSTRAINT "habit_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
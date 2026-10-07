CREATE TABLE "resource_checklist_checks" (
	"project_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	CONSTRAINT "resource_checklist_checks_project_id_resource_id_pk" PRIMARY KEY("project_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "resource_checklists" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_checklist_checks" ADD CONSTRAINT "resource_checklist_checks_project_id_resource_checklists_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."resource_checklists"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_checklist_checks" ADD CONSTRAINT "resource_checklist_checks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_checklists" ADD CONSTRAINT "resource_checklists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
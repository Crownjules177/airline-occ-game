CREATE TABLE "event_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"event_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "status" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "moved_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendance_event_participant" ON "event_attendance" USING btree ("event_id","participant_id");--> statement-breakpoint
ALTER TABLE "event_attendance" ENABLE ROW LEVEL SECURITY;
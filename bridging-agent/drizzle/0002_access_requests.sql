CREATE TABLE "access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Like every table: closed to Supabase's public HTTP API (the app connects as owner).
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;

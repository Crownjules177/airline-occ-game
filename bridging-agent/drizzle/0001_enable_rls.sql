-- Hosted Postgres such as Supabase exposes the public schema through an HTTP API that anyone
-- with the project's public key can call. The app never uses that API: it connects directly as
-- the table owner, which bypasses row-level security. Enabling RLS with no policies therefore
-- shuts the HTTP API out of every table without affecting the app.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

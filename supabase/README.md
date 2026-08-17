# Repair Intelligence History storage

Relational columns are reserved for ownership, relations, lifecycle status and dates. Rich versioned intelligence stays in typed JSONB so the V2 contracts can evolve without a wide, fragile schema. Prediction rows are append-only at repository and database levels.

RLS is enabled without permissive policies. Current application access is server-only through the service-role adapter. Before public/SaaS use, add authentication, make `user_id` mandatory, pass the authenticated owner context through the repository, and create owner-scoped `auth.uid() = user_id` policies.

The memory adapter is ephemeral; switching to Supabase starts with a new durable store. There is no memory-data migration.

## Hosted project setup

1. Create a Supabase project and retain its project reference and database password.
2. Run `npx supabase init` if `supabase/config.toml` does not exist.
3. Run `npx supabase login`.
4. Run `npx supabase link --project-ref <project-ref>`.
5. Preview with `npx supabase db push --dry-run`.
6. Apply with `npx supabase db push`.
7. In the server deployment environment (or ignored `.env.local`), configure `DEAL_HISTORY_STORAGE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
8. Restart the application and call `GET /api/deals`; its `persistence` field must report `adapter: "supabase"` and `durable: true`.

Never place the service-role key in a `NEXT_PUBLIC_` variable. The URL is public metadata; the privileged key stays server-only.

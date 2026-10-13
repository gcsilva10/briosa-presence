# Deploy sem Railway (Vercel + Supabase Auth)
1. Before changing infrastructure, recover a backup of the latest Railway SQLite volume if possible. **Historical attendances on the Railway volume are not migrated automatically.** The committed SQLite is only a snapshot.
2. Create a Supabase project. In SQL Editor run `supabase/schema.sql`.
3. In Supabase Authentication > Users create one email/password user (or separate users if desired). For exactly the same attendance list on all personal devices, **sign in with the SAME account**. Disable open sign-ups if you want the system private. Use a strong password.
4. From Supabase Project Settings > API copy the project URL and the publishable / anon key. Never copy service_role or secret keys to frontend variables.
5. In Vercel project > Settings > Environment Variables set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for production. Remove `VITE_API_URL` (Railway). Redeploy AFTER merging.
6. GitHub Actions: repository Settings > Actions > General > Workflow permissions: ensure workflow can write repository contents for scheduled refreshes. Start workflow `Update Briosa archive` manually to validate sources and job results.
7. Visit / and /presencas. Sign in using the account created at step 3 on both devices. Test marking and unmarking.
8. If the main branch GitHub Actions workflow is disabled after repository inactivity, re-enable it. Scheduled jobs can delay or fail; monitor runs.

Architecture: the public games, standings and game details are generated at build-time from the tracked SQLite snapshot into `public/data`; team badges are in `public/media/clubs`. The browser loads immutable static archive URLs rather than calling Railway. Attendance records are stored in Supabase, isolated per authenticated account via RLS. Supabase is therefore **not used for the match archive**.

Deployment caveat: Cloud sync for attendance requires correct Supabase settings and login. This PR intentionally does not auto-import attendance from the abandoned Railway volume. The archive is only as recent as the last successful GitHub Actions import.

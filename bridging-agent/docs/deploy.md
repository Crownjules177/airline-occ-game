# Deploying the pilot (Supabase + Vercel)

About 20 minutes. You need a GitHub account with access to this repo, and an Anthropic API key.

## 1. Supabase (database, Sydney)

1. Go to supabase.com → **New project**.
2. **Region: Asia-Pacific (Sydney)**, `ap-southeast-2`. This can't be changed later.
3. **Database password:** use **Generate a password**, then check it has only letters and numbers (regenerate if not; symbols have to be URL-encoded in the connection string). Save it in your password manager.
4. When the project is ready, click **Connect** (top of the dashboard) → **Connection string** → **Transaction pooler**. Copy the URI. It looks like:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`
5. Replace `[YOUR-PASSWORD]` (including the brackets) with your password. This is your `DATABASE_URL`.

Use the **transaction pooler** (port 6543), not the direct connection: Vercel can't reach Supabase's direct address. You don't need to create any tables; the first deploy does that and switches on row-level security so Supabase's public API can't read them.

## 2. Anthropic API key

1. console.anthropic.com → **API keys** → **Create key**. Name it `bridging-agent-pilot`.
2. In **Billing → Limits**, set a monthly spend limit (for example $30).

## 3. Vercel (app, Sydney)

1. vercel.com → **Add New… → Project** → import `airline-occ-game` from GitHub.
2. **Root Directory:** click **Edit** and choose `bridging-agent`. Framework preset: Next.js (detected).
3. **Environment Variables:**

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Supabase URI from step 1 |
   | `ANTHROPIC_API_KEY` | the key from step 2 |
   | `BRIDGING_MODEL` | `claude-opus-5` |
   | `APP_URL` | leave for now |

4. **Deploy.** The build applies the database migrations first.
5. Copy the production URL (for example `https://bridging-agent.vercel.app`). Go to **Settings → Environment Variables**, add `APP_URL` with that URL (no trailing slash), then **Deployments → ⋯ → Redeploy**. Invite, sign-in and calendar links use it.

The app's functions run in Sydney (`vercel.json`), next to the database.

Vercel deploys the repository's **production branch** (usually `main`). Until this code is merged there, either merge its pull request first or set **Settings → Git → Production Branch** to the branch it's on.

## 4. Check it

1. Open the URL on your phone → **Start a space** → create "Building meal share".
2. Do your own intake chat. Replies should now come from Claude (a few seconds each), not the fixed demo wording.
3. **Host** tab → **Audit log** should show `intake` calls with model `claude-opus-5`.
4. In Supabase → **Table Editor**, you should see the tables filling up.

## Later: email sign-in links

Create a Resend account, verify a sending domain, then add `RESEND_API_KEY` and `EMAIL_FROM` (for example `Meal share <meals@yourdomain>`) in Vercel and redeploy. Until then people sign in with their personal link.

## Troubleshooting

- **Build fails at "Migrations applied" / connection errors:** check `DATABASE_URL` uses port 6543 and the pooler host, and that the password has no brackets left in it.
- **Links point to localhost:** `APP_URL` isn't set, or you didn't redeploy after setting it.
- **An agent step times out:** check **Deployments → Functions** logs; each call is also in the host audit log with its error.

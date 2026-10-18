# Underscore Verification on Cloudflare Workers

Discord verification using HTTP interactions, Cloudflare Workers, and D1. No always-running process, Discord Gateway connection, local SQLite file, or paid VPS is required. Cloudflare usage limits and billing still apply to your account.

Worker: **https://underscore-verification.peachygang.workers.dev**

The Worker and its D1 database have been deployed. To activate your Discord bot, finish the credentials and portal settings below. Deployment alone does not activate verification.

## 1. Fill in `.env`

A local `.env` has been created from `.env.example`. Save your credentials there, not in the example file or chat. Files such as `.env.production` are not automatically used by the setup scripts. Only `.env` and existing shell environment variables are used; shell values take precedence. Local development can separately use `.dev.vars`.

Create or open your app at the [Discord Developer Portal](https://discord.com/developers/applications).

| Variable | Where to get it |
| --- | --- |
| `DISCORD_TOKEN` | Application > Bot > Reset Token. Copy the bot token. |
| `DISCORD_CLIENT_ID` | Application > General Information > Application ID. |
| `DISCORD_PUBLIC_KEY` | Application > General Information > Public Key. This is separate from the bot token. |
| `DISCORD_CLIENT_SECRET` | Application > OAuth2 > Client Secret. Required for YouTube sign-in. |
| `DISCORD_GUILD_ID` | Enable Developer Mode in Discord > Advanced, then right-click your server > Copy Server ID. |
| `VERIFIED_ROLE_ID` | Create an `Underscore Verified` role, then right-click it > Copy Role ID. |
| `REVIEW_CHANNEL_ID` | Right-click a private moderator text channel > Copy Channel ID. Required for TikTok. |
| `GOOGLE_CLIENT_ID` | Google Cloud > Google Auth Platform > Clients > Web application OAuth client. |
| `GOOGLE_CLIENT_SECRET` | The same Google OAuth client. |
| `YOUTUBE_CHANNEL_ID` | Your creator channel's `UC...` ID, not its @handle. |
| `TIKTOK_USERNAME` | Your creator username without `@`. |
| `VERIFICATION_POLICY` | `youtube`, `tiktok`, `either`, or `both`. |
| `PUBLIC_URL` | `https://underscore-verification.peachygang.workers.dev` |

Choose `youtube` to require automatic YouTube subscription verification only. Choose `tiktok` for moderator-reviewed TikTok evidence only; Google credentials and Discord client secret are then optional. `either` allows either method, and `both` requires both.

## 2. Configure Discord

In OAuth2 > URL Generator, select `bot` and `applications.commands`. Select **Manage Roles**, **View Channels**, and **Send Messages**, then use the generated URL to invite the bot to your server. Privileged gateway intents and Administrator permission are unnecessary.

Move the bot's highest role **above** `Underscore Verified`. Use a normal access role, never an administrative role. Hide protected channels from `@everyone` and allow the verified role to view them. Keep the welcome/verification channel visible to new members; ensure other roles do not already grant access to protected channels.

For TikTok review, give the bot access to the private review channel. Reviewers require **Manage Roles** or Administrator permission and cannot review their own submissions.

Add this redirect URI under OAuth2 > Redirects:

```text
https://underscore-verification.peachygang.workers.dev/oauth/discord
```

After uploading secrets in step 4, set **General Information > Interactions Endpoint URL** to:

```text
https://underscore-verification.peachygang.workers.dev/interactions
```

Discord validates this URL using a signed PING. It cannot save successfully until `DISCORD_PUBLIC_KEY` has been uploaded. The public key must belong to the same application you invite and register. A Gateway bot process is not needed; Discord may show the bot offline while its commands work normally.

## 3. Configure Google for YouTube verification

Skip this step for the `tiktok` policy.

In [Google Cloud Console](https://console.cloud.google.com/), create/select a project, enable **YouTube Data API v3**, and configure Google Auth Platform branding, audience, and consent settings. Create an OAuth client with application type **Web application** and add this exact authorized redirect URI:

```text
https://underscore-verification.peachygang.workers.dev/oauth/google
```

Configure the read-only scope `https://www.googleapis.com/auth/youtube.readonly`. Testing-mode apps require adding your test users. Public rollout may require Google's OAuth verification and your own privacy policy/contact information. Users choose their own Google/YouTube account during sign-in; the bot never subscribes on their behalf.

## 4. Upload configuration and register commands

From PowerShell in this folder:

```powershell
npm.cmd run setup:check
npm.cmd run secrets:upload
npm.cmd run register
```

The upload command sends only the bot configuration allowlist to Cloudflare using stdin. It does not print values, write a temporary secret file, or upload unrelated environment variables. Re-run it after changing `.env`; editing the local file alone does not update a deployed Worker.

Command registration replaces this application's guild commands in the configured server. After secrets are uploaded, save the Interactions Endpoint URL in Discord as described above, then run `/verification-panel` as a member with Manage Server permission in the welcome channel.

Check readiness at [the health endpoint](https://underscore-verification.peachygang.workers.dev/health). It returns HTTP 200 with `ready: true` when required configuration and D1 tables are present; HTTP 503 means setup is incomplete. It does not prove the credentials, role permissions, or provider consent settings work. Complete a real verification in a test server before rollout.

## Commands and verification behavior

| Command | Purpose |
| --- | --- |
| `/verify` | Show private verification options. |
| `/verification-status` | Show saved verification and retry granting the access role. |
| `/verification-panel` | Post a public verification panel; requires Manage Server. |

**YouTube:** a member opens a private ten-minute link, signs into the same Discord account, then authorizes a Google/YouTube account. The Worker checks the subscription and grants access if the policy is satisfied. Each verified YouTube channel can belong to only one Discord member.

**TikTok:** standard TikTok Login/Display APIs do not expose a follow relationship check. Members submit a claimed username and HTTPS screenshot URL. A moderator must independently assess ownership and follow evidence; screenshots can be forged. Approval is a manual decision, not an automatic follow check. Each approved handle can belong to only one Discord member. Evidence URLs are never downloaded by the bot.

Verification is a point-in-time check. Later unsubscribes and unfollows do not automatically revoke the role. Tokens from Discord/Google OAuth are not stored, so background subscription checks are not possible. Saved approvals survive role assignment failures; fix role hierarchy/permissions and use `/verification-status` to retry.

## Development and future deployments

Node.js 24 or newer is required for local tooling. On non-Windows systems use `npm` instead of `npm.cmd`.

```powershell
npm.cmd ci
npm.cmd run db:local
npm.cmd run dev
```

Wrangler runs the Worker locally on port 8787 and reads `.env` when no `.dev.vars` exists. For local OAuth testing, create `.dev.vars` from `.dev.vars.example`, fill it completely, and set its `PUBLIC_URL` to a publicly reachable HTTPS tunnel origin or `http://localhost:8787` when testing from the same computer. Register those exact callback URLs in the provider portals. `.dev.vars` affects only local Wrangler; the upload/registration scripts use `.env` to avoid accidentally deploying tunnel settings.

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run deploy:check
# Apply only new database migrations, then deploy code:
npm.cmd run db:remote
npm.cmd run deploy
```

The test suite uses the actual Workers runtime and local D1 with mocked Discord/Google services. Live provider consent, server permissions, and account configuration require a real verification test.

For a different Cloudflare account: run `npm.cmd run cf:login`, create a database with `npm.cmd run db:create`, replace `database_id` in `wrangler.jsonc` with the result, run the remote migration, then deploy. Use that deployment's URL in `.env` and provider settings. This project's database is already created and configured; do not create it again for the current account.

## Data and operations

D1 stores Discord IDs, verified YouTube channel IDs, approved TikTok usernames, review evidence URLs/decisions/reviewer IDs, hashed temporary OAuth sessions, and temporary interaction IDs. Session state is bound to the browser, consumed atomically, and expires after ten minutes. A scheduled job cleans expired sessions and interaction IDs hourly. OAuth state persists across Worker requests and deployments.

Keep D1 and the moderator channel private. For a member's data deletion request, remove their `members` row by `id`, their `reviews` rows by `user`, and their `sessions` rows by `user` using the Cloudflare D1 console. Also delete evidence messages from Discord and remove their access role where appropriate. Other users' reviews can contain the member's ID as `reviewer`; redact it if the request includes that audit trail. Verification records otherwise remain until manually removed. Provide your community's contact and privacy policy before public rollout.

Automatic Worker observability is disabled to avoid retaining OAuth query strings. Do not enable URL logging without query-string redaction. Application error messages omit provider bodies, credentials, OAuth codes, and interaction tokens.

References: [Discord interaction security and responses](https://docs.discord.com/developers/interactions/receiving-and-responding), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [YouTube subscription checks](https://developers.google.com/youtube/data/guides/implementation/subscriptions), [TikTok scopes](https://developers.tiktok.com/doc/en/tiktok-api-scopes/).

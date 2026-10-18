# Underscore Verification on Cloudflare Workers

Discord verification using HTTP interactions, Cloudflare Workers, and MongoDB's native Node.js driver. No Discord Gateway process or D1 binding is required. Cloudflare and MongoDB usage limits and billing apply to your accounts.

Worker: **https://underscore-verification.peachygang.workers.dev**

The deployed Worker uses MongoDB. Its collections and indexes have been initialized, and the production Worker connection has been verified. The previous D1 database is preserved. The steps below also cover future database changes and fresh deployments.

## MongoDB setup and switching an existing deployment

Use **MongoDB Atlas or a MongoDB replica set**. Transactions are required for safe moderator approvals and settings changes; a standalone `mongod` instance is insufficient.

1. In Atlas, create a database user with read/write access to the bot's database. Configure Network Access to permit connections from your development computer and Cloudflare Worker egress. A successful connection from your computer does not guarantee the Worker is permitted. Use TLS and a strong database password; URL-encode special characters when constructing the URI.
2. Save `MONGODB_URI` and `MONGODB_DB_NAME=underscore_verification` in `.env.production`. Copy the URI from Atlas > Connect > Drivers, replace its password placeholder, and keep it out of chat and version control.
3. Initialize the collections and indexes, then check connectivity:

```powershell
npm.cmd run db:init:production
npm.cmd run db:check:production
```

Initialization creates unique indexes for social identities and pending reviews, TTL indexes for temporary records, and a schema marker. The Worker refuses database operations until initialization succeeds. Initialization is idempotent and does not delete member records. Database checks validate required indexes and transaction-capable topology.

4. If you want to retain old D1 settings, verifications, and reviews, stop Discord traffic during the switch and run the optional importer **before configuring new MongoDB settings**:

```powershell
npm.cmd run db:import:d1 -- --env-file=.env.production
```

The importer reads the previous database using `wrangler.d1-legacy.jsonc`, requires empty target member/review/settings collections, and imports those collections in a transaction. It does not change D1 or write a plaintext export. Temporary OAuth sessions and interaction claims are not migrated. Do not run both old and new versions with live traffic during migration. For a fresh start, skip importing and configure the creator accounts and role again after deployment.

5. Upload credentials and deploy:

```powershell
npm.cmd run secrets:upload:production
npm.cmd run deploy
```

For a database-only change to an existing Worker, use `npm.cmd run secrets:upload:database:production` instead of the full secret upload; it updates only MongoDB configuration and preserves the bot's existing secrets. The production Worker has no D1 binding. The legacy config and SQL migrations are retained only for source-data migration. Command definitions, OAuth callbacks, and the Worker URL are unchanged by the MongoDB switch.

## 1. Fill in `.env`

Use `.env` for local development and `.env.production` for deployment credentials. Scripts read `.env` by default. The `:production` commands select `.env.production`; other Node setup scripts accept `--env-file=.env.production` or the `ENV_FILE` environment variable. The selected file is read by itself rather than merged with another file, and shell environment variables take precedence. Local Wrangler reads `.env` unless you provide local `.dev.vars` overrides. Keep populated configuration files out of version control.

Create or open your app at the [Discord Developer Portal](https://discord.com/developers/applications).

| Variable | Where to get it |
| --- | --- |
| `MONGODB_URI` | Atlas > Connect > Drivers > connection string, including your database user's credentials. |
| `MONGODB_DB_NAME` | Database name, default `underscore_verification`. Use a dedicated database for this server. |
| `DISCORD_TOKEN` | Application > Bot > Reset Token. Copy the bot token. |
| `DISCORD_CLIENT_ID` | Application > General Information > Application ID. |
| `DISCORD_PUBLIC_KEY` | Application > General Information > Public Key. This is separate from the bot token. |
| `DISCORD_CLIENT_SECRET` | Application > OAuth2 > Client Secret. Required for YouTube sign-in. |
| `DISCORD_GUILD_ID` | Enable Developer Mode in Discord > Advanced, then right-click your server > Copy Server ID. |
| `VERIFIED_ROLE_ID` | Optional default; configure in Discord with `/getrole role:@Verified` or a role ID. |
| `REVIEW_CHANNEL_ID` | Right-click a private moderator text channel > Copy Channel ID. Required for TikTok. |
| `GOOGLE_CLIENT_ID` | Google Cloud > Google Auth Platform > Clients > Web application OAuth client. |
| `GOOGLE_CLIENT_SECRET` | The same Google OAuth client. |
| `YOUTUBE_CHANNEL_ID` | Optional default; configure with `/youtube setup channel:@yourhandle` or a `UC...` ID. |
| `YOUTUBE_API_KEY` | Required for username/@handle lookup only. Create an API key in Google Cloud and restrict it to YouTube Data API v3. IDs work without it. |
| `TIKTOK_USERNAME` | Optional default; configure with `/tiktok setup username:@yourhandle`. |
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
npm.cmd run endpoint:setup
```

The upload command sends only the bot configuration allowlist to Cloudflare using stdin. It does not print values, write a temporary secret file, or upload unrelated environment variables. Re-run it after changing `.env`; editing the local file alone does not update a deployed Worker.

Command registration replaces this application's guild commands in the configured server. The endpoint setup command asks Discord to validate and save the Worker interactions URL; you can also save it manually in the portal as described above. Then run `/verification-panel` as a member with Manage Server permission in the welcome channel.

You can leave `VERIFIED_ROLE_ID`, `YOUTUBE_CHANNEL_ID`, and `TIKTOK_USERNAME` empty when uploading initial credentials and set them with the commands below. The setup commands remain available before verification is fully configured. `/health` becomes ready only after all requirements for your chosen policy are present, including provider credentials and the TikTok review channel where applicable.

## Configure accounts and the role in Discord

```text
/tiktok setup username:@underscore
/youtube setup channel:@underscore
/youtube setup channel:UCxxxxxxxxxxxxxxxxxxxxxx
/getrole role:@Verified
/getrole role:123456789012345678
```

`/tiktok setup` and `/youtube setup` require **Manage Server**. `/getrole` requires **Manage Roles**. These commands configure the server; `/getrole` does not directly give a member an unverified role. The role must be a normal access role below both the bot's highest role and your highest role (the server owner is exempt from the latter). It cannot have Administrator, Manage Server, or Manage Roles permissions.

YouTube setup accepts a modern `@handle`, plain username, `UC...` channel ID, `https://youtube.com/@handle`, `/channel/UC...`, or `/user/LegacyName` URL. Handle/username lookup uses the official YouTube Data API and requires `YOUTUBE_API_KEY` in the Worker secrets; a syntactically valid channel ID is saved directly without an API lookup. Plain names try an exact handle first, then a legacy username; channel display-name searches are not supported. Add the API key to `.env` and run `npm.cmd run secrets:upload` if lookup is not configured. Existing Google OAuth credentials are still needed for member verification.

Settings persist in MongoDB, apply to subsequent verification requests, and override `.env`/Worker-secret defaults. Re-uploading configuration does not overwrite saved Discord settings. No code deployment is needed when using these commands. Changing a creator account clears saved verification for that platform and expires active OAuth links; changing the TikTok account also rejects pending reviews. Existing Discord roles are retained. Selecting a new access role affects future grants and `/verification-status` retries; it does not bulk-migrate existing members' roles. Setting the same creator again preserves completed verification.

Check readiness at [the health endpoint](https://underscore-verification.peachygang.workers.dev/health). It returns HTTP 200 with `ready: true` when required configuration, MongoDB connectivity, indexes, and transaction-capable topology are present. `databaseReady` distinguishes a database connection/index problem from missing verification configuration. HTTP 503 with `databaseReady: true` and `reason: verification_configuration_incomplete` means MongoDB is working but creator accounts, the access role, or other required configuration are missing. It does not prove Discord role permissions or provider consent settings work. Complete a real verification in a test server before rollout.

## Commands and verification behavior

| Command | Purpose |
| --- | --- |
| `/verify` | Show private verification options. |
| `/verification-status` | Show saved verification and retry granting the access role. |
| `/verification-panel` | Post a public verification panel; requires Manage Server. |
| `/tiktok setup username:...` | Save the required TikTok creator account; requires Manage Server. |
| `/youtube setup channel:...` | Save the required YouTube creator channel; requires Manage Server. |
| `/getrole role:...` | Save the role awarded after verification; accepts a role mention or ID and requires Manage Roles. |

**YouTube:** a member opens a private ten-minute link, signs into the same Discord account, then authorizes a Google/YouTube account. The Worker checks the subscription and grants access if the policy is satisfied. Each verified YouTube channel can belong to only one Discord member.

**TikTok:** standard TikTok Login/Display APIs do not expose a follow relationship check. Members submit a claimed username and HTTPS screenshot URL. A moderator must independently assess ownership and follow evidence; screenshots can be forged. Approval is a manual decision, not an automatic follow check. Each approved handle can belong to only one Discord member. Evidence URLs are never downloaded by the bot.

Verification is a point-in-time check. Later unsubscribes and unfollows do not automatically revoke the role. Tokens from Discord/Google OAuth are not stored, so background subscription checks are not possible. Saved approvals survive role assignment failures; fix role hierarchy/permissions and use `/verification-status` to retry.

## Development and future deployments

Node.js 24 or newer is required for local tooling. On non-Windows systems use `npm` instead of `npm.cmd`.

```powershell
npm.cmd ci
npm.cmd run db:init
npm.cmd run dev
```

Wrangler runs the Worker locally on port 8787 and reads `.env` when no `.dev.vars` exists. Use a separate MongoDB development database, backed by Atlas or a local replica set. For local OAuth testing, set `PUBLIC_URL` to a publicly reachable HTTPS tunnel origin or `http://localhost:8787` when testing from the same computer, and register those exact callback URLs in the provider portals. Optional `.dev.vars` overrides apply only to local Wrangler; production scripts explicitly select `.env.production`.

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run deploy:check
# Initialize/check MongoDB before deploying:
npm.cmd run db:init:production
npm.cmd run secrets:upload:production
npm.cmd run deploy
```

The tests start a real, isolated MongoDB replica set with `mongodb-memory-server`, exercise actual MongoDB transactions/indexes, and connect from the actual Workers runtime. Discord/Google services are mocked. The first run downloads a MongoDB binary into the package's local cache; later runs reuse it. Tests never use the `.env` or `.env.production` database. Live provider consent, server permissions, Atlas TLS/network access, and account configuration require a real verification test.

For a different Cloudflare account: run `npm.cmd run cf:login`, initialize your MongoDB database, upload configuration, and deploy. Use that deployment's URL in the selected configuration file and provider settings. No Cloudflare database provisioning is needed.

## Data and operations

MongoDB stores Discord IDs, verified YouTube channel IDs, approved TikTok usernames, review evidence URLs/decisions/reviewer IDs, hashed temporary OAuth sessions, temporary interaction IDs, and server settings with the administrator ID and update timestamp. Session state is bound to the browser, consumed atomically, and expires after ten minutes. TTL indexes and an hourly scheduled job clean expired records; expiry is also checked before consuming a session because TTL deletion is asynchronous. OAuth state persists across Worker requests and deployments. Each Worker invocation opens and closes its own MongoDB connection. Database work is deferred after Discord acknowledgement; the TikTok modal can open without connecting to the database.

Keep MongoDB and the moderator channel private. For a member's data deletion request, remove their `members` document by string `_id`, their `reviews` documents by `user`, and their `sessions` documents by `user` using Atlas or a trusted MongoDB tool. Also delete evidence messages from Discord and remove their access role where appropriate. Other records can contain the member's ID as `reviewer` or `updated_by`; redact them when appropriate. If you imported D1 records, the preserved source and backups require the same deletion handling. Verification records otherwise remain until manually removed. Provide your community's contact and privacy policy before public rollout.

Automatic Worker observability is disabled to avoid retaining OAuth query strings. Do not enable URL logging without query-string redaction. Application error messages omit provider bodies, credentials, OAuth codes, and interaction tokens.

References: [MongoDB on Workers](https://developers.cloudflare.com/workers/databases/third-party-integrations/mongodb/), [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), [Discord interaction security and responses](https://docs.discord.com/developers/interactions/receiving-and-responding), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [YouTube subscription checks](https://developers.google.com/youtube/data/guides/implementation/subscriptions), [TikTok scopes](https://developers.tiktok.com/doc/en/tiktok-api-scopes/).

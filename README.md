# Underscore Screenshot Verification

Discord screenshot verification on Cloudflare Workers and MongoDB. Members subscribe to your YouTube channel or follow your TikTok account, post a screenshot directly in the configured verification channel, and receive automatic approval for clear matches. Uncertain screenshots go to staff. No Google sign-in, OAuth consent screen, or Google OAuth credentials are required.

Screenshots cannot reliably prove account ownership or a genuine subscription by themselves. This bot uses **automatic image checks with staff fallback**, then grants the configured role after approval. It does not independently verify the claimed account or detect every forged image.

## Configure the server

Create a member-facing `#verify` text channel and a separate private `#verification-review` staff channel. Hide the staff review channel from `@everyone`, and allow your staff roles and the bot to view it. Give the bot **View Channel**, **Send Messages**, **Embed Links**, and **Attach Files** in the review channel. Give it **Manage Roles** and move its highest role above the normal access role it will award.

Use these administrator commands:

```text
/channel setup channel:#verify review-channel:#verification-review
/getrole role:@Verified
/youtube setup channel:UCxxxxxxxxxxxxxxxxxxxxxx
/youtube view
/youtube help
/tiktok setup username:@youraccount
/tiktok view
/tiktok help
/panel channel:#free-code
/panel channel:#verify
```

`/channel setup`, `/panel`, and creator account setup require **Manage Server**. `/getrole` and staff review buttons require **Manage Roles**. The bot rejects public staff review channels and checks its channel permissions before saving settings. It does not change your channel permissions automatically.

`/panel` posts branded instructions and creator links. In `#verify`, the panel has no upload buttons; members send a normal image message. In another channel, it includes an **Open verification channel** button. You can omit the panel's `channel` option to post in the current channel. `/verification-panel` remains an alias.

`/youtube setup` accepts a channel ID, username, handle, or supported YouTube channel URL. Username/handle lookup requires `YOUTUBE_API_KEY`; a `UC...` channel ID does not. This lookup is used only for administrator setup, not member sign-in.

## Member experience

1. Subscribe or follow using the panel's creator links.
2. Take a clear screenshot showing the correct creator and **Subscribed** or **Following** status.
3. Send one screenshot directly in `#verify`. The bot detects the platform and replies with the result.
4. Clear matches are approved automatically. Staff approve or reject uncertain screenshots in the private review channel. Once approved and the policy is satisfied, the bot grants the access role.

PNG, JPG, and WebP screenshots up to **8 MB** are accepted. The bot validates file metadata and image signatures and reuploads the image into the staff channel, so temporary upload URLs do not make pending evidence disappear.

For screenshots the bot cannot identify, use the slash-command attachment fallback:

```text
/verify platform:youtube screenshot:<attach image> username:yourusername
/verify platform:tiktok screenshot:<attach image> username:yourusername
```

**Normal image messages in the configured verification channel submit verification automatically.** No button, external image host or pasted URL is required.

Members can use `/verification-status` to check pending/rejected/approved submissions and retry a failed role grant. One pending screenshot per member is allowed. Rejected members may submit another image. Staff cannot approve their own proof, and only the original review message can approve its associated submission. Concurrent decisions and repeated button clicks cannot grant approval twice.

The `VERIFICATION_POLICY` setting supports `youtube`, `tiktok`, `either`, or `both`. With `both`, each platform requires its own approved screenshot; members submit the second after the first is approved or rejected. Verification is a point-in-time image assessment. Later unsubscribes/unfollows do not automatically revoke access.

## Hosting and configuration

Use Node.js 24+ locally, Cloudflare Workers, and MongoDB Atlas or another transaction-capable MongoDB replica set. Keep a dedicated MongoDB database for this server. MongoDB network access must permit both your development computer and Worker egress.

Copy `.env.example` to `.env` for development or `.env.production` for production credentials. Settings saved by Discord commands override environment defaults and persist across deployments.

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal. |
| `DISCORD_CLIENT_ID` | Application ID. |
| `DISCORD_PUBLIC_KEY` | Public Key under General Information; validates Discord requests. |
| `DISCORD_GUILD_ID` | Your server ID. |
| `MONGODB_URI` | Private MongoDB connection string. |
| `MONGODB_DB_NAME` | Database name; defaults to `underscore_verification`. |
| `PUBLIC_URL` | Public HTTPS origin serving the Worker. |
| `VERIFICATION_POLICY` | `youtube`, `tiktok`, `either`, or `both`. |
| `YOUTUBE_CHANNEL_ID` | Optional default; usually set with `/youtube setup`. |
| `YOUTUBE_API_KEY` | Optional: resolve handles/usernames during creator setup. |
| `TIKTOK_USERNAME` | Optional default; usually set with `/tiktok setup`. |

Google OAuth client IDs/secrets, Discord OAuth client secrets, and OAuth redirect registration are no longer used. Old `/start` and OAuth callback URLs return a message directing members to screenshot verification in Discord.

Invite the bot with `bot` and `applications.commands` scopes. It does not require Administrator or privileged gateway intents. An offline presence badge is normal for an HTTP interaction bot and does not prevent commands from working.

From PowerShell in this folder:

```powershell
npm.cmd ci
npm.cmd run db:init:production
npm.cmd run db:check:production
npm.cmd run secrets:upload:production
npm.cmd run deploy
npm.cmd run register -- --env-file=.env.production
npm.cmd run endpoint:setup -- --env-file=.env.production
```

The endpoint setup command asks Discord to validate and save `<PUBLIC_URL>/interactions`. Existing installations generally only need code deployment and command registration for this update, then `/channel setup` and new panels. Saved creator accounts and access roles are preserved. Old platform buttons now open screenshot upload forms; post a new panel to replace OAuth-era instructions.

The `:production` utilities explicitly read `.env.production`. Other CLI utilities default to `.env` and accept `--env-file=.env.production`. Shell environment variables take precedence. Local Wrangler reads `.env` or `.dev.vars`; production secrets are uploaded explicitly. Secrets are passed to Wrangler through stdin and are not printed or written to a temporary export.

For local development, initialize a separate development MongoDB database with `npm.cmd run db:init`, then run `npm.cmd run dev`. Use `npm` instead of `npm.cmd` outside Windows.

## Checks and operations

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run deploy:check
```

Tests use an isolated local MongoDB replica set and mocked Discord services. They never use your production database. The first test run downloads a MongoDB binary; later runs reuse the cache. Live server permissions and actual Discord upload UI still require a real member submission.

`GET /health` reports `ready` and `databaseReady`. A healthy database with `verification_configuration_incomplete` means an administrator still needs to set a role, creator account, or verification channel. Setup commands remain usable before all verification settings are present. The hourly cleanup job removes expired temporary records and releases stale undelivered submissions.

MongoDB stores Discord IDs, claimed social usernames, approved targets, screenshot attachment references, review decisions, and settings audit metadata. Screenshot copies are stored in Discord's staff channel, not in MongoDB. Keep that channel private. For data removal, delete the member's database records and screenshot review messages; manually remove access roles when appropriate. Existing verification and roles remain until explicitly reset or removed. Changing a creator account clears approval for that platform and rejects its pending reviews; existing Discord roles are retained.

Code layout: [Architecture guide](docs/architecture.md). Reference: [Discord file upload components](https://docs.discord.com/developers/components/reference#file-upload).


Automatic screenshot checks use the Cloudflare Workers AI binding (`@cf/google/gemma-4-26b-a4b-it`). Clear images with an exact creator @handle and active Subscribed/Following state are approved automatically; ambiguous images, provider failures and timeouts stay pending for staff. YouTube automatic matching requires YOUTUBE_API_KEY to resolve the saved channel ID to its canonical handle. Screenshots are sent to Cloudflare for analysis and retained in the private Discord review channel. Image matching cannot prove account ownership or detect every forgery; claimed usernames are not independently verified. There is no Google sign-in. Workers AI usage is subject to Cloudflare quotas and pricing.

See [project structure](docs/architecture.md) for command modules, HTTP interaction events and content/embed/Components V2 response builders. Creator view/help commands currently require Manage Server, like setup.

Access role and submission/review channel IDs are stored only in MongoDB by `/getrole` and `/channel setup`; they are not environment variables or Worker secrets.


## Direct image uploads

Enable **Message Content Intent** under Bot in Discord Developer Portal. A named Cloudflare Durable Object maintains the Discord Gateway connection and listens for member images in the MongoDB-configured submission channel. The bot replies to each image with checking, approved, staff-review or retry instructions. Only one PNG/JPG/WebP up to 8 MB per message is accepted. Bots, webhooks, other servers and other channels are ignored. Platform detection reads the screenshot; unreadable platforms can use the slash attachment fallback. `/verify` with no options gives direct upload instructions; existing slash attachment/modal submissions remain compatible.

The Gateway uses heartbeats, resume/reconnect, backoff and an alarm supervisor. Fatal token/intent errors stop reconnection attempts. Outgoing WebSockets cannot hibernate and incur Cloudflare Durable Object duration charges. Queued message metadata is temporarily stored in the Durable Object until processed, then deleted. The hourly cron restarts the listener if needed. An authenticated POST to `/internal/gateway` with the bot token as Bearer authorization starts/checks the listener; never share that token. Public `/health` remains the database/configuration check.

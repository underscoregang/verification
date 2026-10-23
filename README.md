# Underscore Verifier

A Discord bot that gives members an access role after they prove they subscribe to your YouTube channel or follow your TikTok account. Members post a screenshot in a verification channel; Cloudflare Workers AI reads it, clear matches get the role automatically, and unclear ones go to staff.

It runs on Cloudflare Workers with MongoDB. It is not a public bot: it serves one Discord server and leaves any other server it is added to.

> Screenshots cannot prove account ownership or a real subscription. The bot rejects clear mismatches and sends unclear images to staff, but it cannot detect every edited or reused screenshot.

## How it works for members

1. Subscribe or follow using the creator links in the verification panel.
2. Take a screenshot that shows the creator's **@handle** and **Subscribed** or **Following**.
3. Post it as a normal image in the verification channel.

The bot replies with **⏳ Processing your screenshot…**, deletes the screenshot, then shows the result and deletes that reply after 5 seconds, so the channel stays empty:

| Result | Meaning |
| --- | --- |
| ✅ **Passed** | The image clearly matches. The access role is granted. |
| ❌ **Failed** | The image clearly shows another account or no subscription/follow, or the file is not a usable image. The member can send a new screenshot right away. |
| 🕵️ **Sent to staff review** | The image could not be read clearly. Staff approve or reject it in the private review channel. |

Members can also use `/verify` to upload a screenshot privately, and `/help` to see these instructions. PNG, JPG and WebP files up to **8 MB** are accepted.

## Commands

| Command | Who | What it does |
| --- | --- | --- |
| `/help` | Everyone | How to get verified. Staff also see the setup commands. |
| `/verify` | Everyone | Upload a screenshot privately instead of posting it. |
| `/verification-status` | Everyone | Show approval status and retry granting the role. |
| `/channel setup` | Manage Server | Choose the verification channel and the private staff review channel. |
| `/channel logs` | Manage Server | Choose the private channel for bot logs. |
| `/getrole` | Manage Roles | Choose the role given after verification, and optionally a role removed (`remove-role:@Unverified`). |
| `/youtube setup` · `view` · `help` | Manage Server | Set or check the YouTube creator (channel ID, @handle or URL). |
| `/tiktok setup` · `view` · `help` | Manage Server | Set or check the TikTok creator. |
| `/panel` | Manage Server | Post the verification instructions. `/verification-panel` is an alias. |

## Set up a server

1. In the [Discord Developer Portal](https://discord.com/developers/applications), open the application and go to **Bot**:
   - Turn on **Message Content Intent** (the bot reads image messages).
   - Turn off **Public Bot** so only you can add it to servers.
2. Invite the bot with the `bot` and `applications.commands` scopes.
3. Create the channels and give the bot these permissions:

   | Channel | Bot permissions |
   | --- | --- |
   | `#verify`, where members post screenshots | View Channel, Send Messages, **Manage Messages** (to delete screenshots and results) |
   | `#verification-review`, private to staff | View Channel, Send Messages, Embed Links, Attach Files |
   | `#bot-logs`, private to staff | View Channel, Send Messages, Embed Links |

   Give the bot **Manage Roles** and move its role above the access role.
4. Run the setup commands:

   ```text
   /channel setup channel:#verify review-channel:#verification-review
   /channel logs channel:#bot-logs
   /getrole role:@Verified remove-role:@Unverified
   /youtube setup channel:@yourchannel
   /tiktok setup username:@youraccount
   /panel channel:#verify
   ```

The bot checks its permissions before saving each channel and refuses staff channels that `@everyone` can see. It never changes channel permissions itself.

### Verification policy

`VERIFICATION_POLICY` is `youtube`, `tiktok`, `either` or `both`. With `both`, members send one screenshot per platform, and the role is granted after the second passes. Verification is a one-time check: unsubscribing later does not remove the role.

### Server logs

The bot posts to the `/channel logs` channel when it:

- **Is added to another server:** it leaves right away and logs the server, owner and, when the audit log is readable, who added it.
- **Leaves a server:** it logs whether it left automatically or was removed.
- **Is re-added to the home server.**

## Deploy

You need Node.js 24+, a Cloudflare account with Workers and Workers AI, and a MongoDB replica set that supports transactions (MongoDB Atlas works). MongoDB network access must allow Cloudflare Workers.

1. Copy `.env.example` to `.env.production` and fill it in:

   | Variable | Purpose |
   | --- | --- |
   | `DISCORD_TOKEN` | Bot token. |
   | `DISCORD_CLIENT_ID` | Application ID. |
   | `DISCORD_PUBLIC_KEY` | Public key; verifies requests from Discord. |
   | `DISCORD_GUILD_ID` | The one server this bot serves. |
   | `MONGODB_URI` | MongoDB connection string. |
   | `MONGODB_DB_NAME` | Database name; defaults to `underscore_verification`. |
   | `PUBLIC_URL` | Public HTTPS address of the Worker. |
   | `VERIFICATION_POLICY` | `youtube`, `tiktok`, `either` or `both`. |
   | `YOUTUBE_API_KEY` | Needed to look up YouTube handles for setup and automatic checks. |
   | `YOUTUBE_CHANNEL_ID`, `TIKTOK_USERNAME` | Optional defaults; usually set with `/youtube setup` and `/tiktok setup`. |

   Channel and role IDs are not environment variables; the setup commands save them in MongoDB.

2. From PowerShell in this folder (use `npm` instead of `npm.cmd` outside Windows):

   ```powershell
   npm.cmd ci
   npm.cmd run cf:login
   npm.cmd run db:init:production
   npm.cmd run secrets:upload:production
   npm.cmd run deploy
   npm.cmd run register -- --env-file=.env.production
   npm.cmd run endpoint:setup -- --env-file=.env.production
   ```

`endpoint:setup` registers `<PUBLIC_URL>/interactions` with Discord. Secrets are uploaded to Cloudflare from `.env.production` and are never stored in `wrangler.jsonc`.

### Automatic deployment

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): a syntax check and a build without uploading, then `wrangler deploy` and slash command registration. You can also start it from the **Actions** tab. Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A token from the **Edit Cloudflare Workers** template. Read-only tokens cannot deploy. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (`npm.cmd run cf:whoami`). |
| `DISCORD_TOKEN` | Bot token. |
| `DISCORD_CLIENT_ID` | Application ID. |
| `DISCORD_GUILD_ID` | Home server ID. |

The workflow deploys code only. Run `secrets:upload:production` and `db:init:production` yourself when secrets or database indexes change.

### Local development

Local `db:init` and `db:check` commands (including the production variants) use
DNS resolvers `1.1.1.1` and `8.8.8.8` for MongoDB SRV/TXT discovery. Override them
with `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` in the selected environment file, or
set `MONGODB_DNS_SERVERS=` to keep the system resolver. These settings affect
Node DNS queries, not operating-system hostname lookups or Atlas network access.
This setting is local only and is not uploaded as a Worker secret. Cloudflare
Workers already resolves DNS through Cloudflare's DNS-over-HTTPS service:
https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/ .

Use a separate development database: `npm.cmd run db:init`, then `npm.cmd run dev`. Workers AI always runs on Cloudflare, so local checks use your real AI quota.

## Operations

```powershell
npm.cmd run check         # syntax check
npm.cmd run deploy:check  # build without uploading
npx wrangler tail         # live production logs
npx wrangler rollback     # return to the previous version
```

- `GET /health` reports `ready` and `databaseReady`.
- A Durable Object keeps the Discord Gateway connection open, with heartbeats, resume and backoff. An hourly cron and a one-minute alarm restart it if needed. Outgoing WebSockets cannot hibernate, so the connection incurs Durable Object duration charges.
- `POST /internal/gateway` with `Authorization: Bearer <DISCORD_TOKEN>` starts the connection and reports its status.
- The hourly cron also removes expired temporary records.

## Data and privacy

- **MongoDB** stores Discord IDs, approval status, the creator each approval was for, review decisions, and who changed settings.
- **Screenshots** are sent to Cloudflare Workers AI for reading and copied into the private staff review channel. They are not stored in MongoDB, and the original message is deleted from the verification channel.
- **To remove a member's data,** delete their MongoDB records and their review messages, then remove the role if needed.
- **Changing a creator account** clears approvals for that platform and rejects its pending reviews; existing roles stay.

## Security

See [SECURITY.md](SECURITY.md) for how to report a vulnerability and how the bot protects tokens, roles and screenshots.

## License

[MIT](LICENSE) © Underscore Gang

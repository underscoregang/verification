# Security Policy

## Supported versions

Only the latest code on `main`, which is what runs in production, receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately on GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, how to reproduce it, and what an attacker could do with it. Leave tokens, member data and screenshots out of the report.

We aim to reply within 7 days and to tell you when the issue is fixed. Please give us a reasonable time to fix it before you share details publicly.

**Accidentally exposed a token or secret?** Treat it as compromised: reset it at its source (Discord Developer Portal, Cloudflare, MongoDB Atlas or Google Cloud), upload the new value with `npm run secrets:upload:production`, and update the matching GitHub Actions secret.

## How the bot protects itself

**Requests and access**
- Every request to `/interactions` is checked against Discord's signature with `DISCORD_PUBLIC_KEY` before it is read. Bodies over 64 KB are refused.
- The bot serves only `DISCORD_GUILD_ID`. Interactions from other servers are refused, and the bot leaves any other server it is added to and logs it.
- `/internal/gateway` requires the bot token as a Bearer token.

**Roles and staff actions**
- The access role cannot have Administrator, Manage Server or Manage Roles, and must sit below the bot's role and the role of the admin who sets it.
- Setup commands need Manage Server; `/getrole` and review buttons need Manage Roles.
- Staff cannot approve their own screenshot. Each review can be decided once, even with repeated or simultaneous clicks.
- Each Discord event and interaction is processed once.

**Screenshots**
- Only one PNG, JPG or WebP image up to 8 MB is accepted per submission. The file type is checked from its bytes, not its name, and images are only downloaded from Discord's CDN.
- The AI model is told to treat the image as untrusted evidence and to ignore any instructions written in it. Automatic approval needs an exact creator handle, a clear Subscribed or Following state, no signs of editing, and at least 95% confidence. Anything less goes to staff.
- Staff review and log channels must be private. Screenshots are deleted from the member-facing channel after checking.

**Secrets**
- Tokens and connection strings live in Cloudflare Worker secrets and GitHub Actions secrets, never in the repository or `wrangler.jsonc`. `.env` files are ignored by git.
- Error replies and logs include only short error codes, never tokens or connection strings.

## Limits

Screenshots cannot prove account ownership or a real subscription. The bot does not verify that the member owns the social account shown, and a convincing edited image may pass. Treat the role as proof of a screenshot check, not of identity.

## Recommended setup

- Turn off **Public Bot** in the Discord Developer Portal.
- Give the bot only the permissions listed in the README; it does not need Administrator.
- Use a Cloudflare API token limited to this account, and a MongoDB user limited to this database.
- Restrict MongoDB network access as tightly as your host allows.
- Enable **Private vulnerability reporting** under the repository's **Settings → Code security** so the reporting steps above work.

# Project structure

```text
underscore-verification/
├── src/
│   ├── index.js                 # Cloudflare Worker entrypoint
│   ├── app.js                   # Request routing and scheduled cleanup
│   ├── cli/
│   │   ├── manage.js            # Setup, database, secrets, endpoint commands
│   │   └── register.js          # Register Discord slash commands
│   ├── config/
│   │   ├── runtime.js           # Worker configuration and verification policy
│   │   └── local-env.js         # CLI-only environment file loader
│   ├── database/
│   │   ├── connection.js        # MongoDB connection lifecycle and indexes
│   │   └── store.js             # Persistence, sessions, reviews, transactions
│   ├── discord/
│   │   ├── commands.js          # Slash command definitions
│   │   ├── client.js            # Discord REST calls and response editing
│   │   ├── components.js        # Buttons, rows, and interaction messages
│   │   ├── interactions.js      # Command, button, and modal handling
│   │   ├── roles.js             # Verification access role assignment
│   │   └── setup.js             # Creator-account and access-role configuration
│   ├── http/
│   │   ├── client.js            # Provider requests, timeouts, safe errors
│   │   ├── responses.js         # Response formatting and security headers
│   │   └── urls.js              # URL query construction
│   ├── routes/
│   │   ├── interactions.js      # Signed Discord webhook ingress and deferral
│   │   ├── oauth.js             # Discord/Google sign-in and YouTube verification
│   │   └── health.js            # Database and configuration readiness
│   ├── services/
│   │   └── youtube.js           # YouTube handle/username resolution
│   └── shared/
│       └── security.js          # Signatures, tokens, cookies, input validation
├── docs/
│   └── architecture.md
├── .env.example                # Configuration template; no real credentials
├── package.json                # Stable npm command interface
├── package-lock.json
├── wrangler.jsonc              # Worker deployment configuration
└── README.md                   # Setup, operations, and command documentation
```

`.env`, `.env.production`, `node_modules/`, `.wrangler/`, and `dist/` are local or generated files excluded from version control. There are no SQL migrations or D1 runtime bindings.

## Request flow

`index.js` exports the Worker assembled by `app.js`. The app selects an HTTP route. The Discord interaction route validates signatures and acknowledges requests before opening MongoDB connections; deferred interaction handlers perform command work. OAuth routes bind sign-in to the Discord member and browser, then record verification and grant the configured role. The health route reports database and configuration readiness separately.

`database/connection.js` owns request-scoped MongoDB clients. `database/store.js` owns collection operations and transactions. Route and Discord modules use the store rather than issuing database queries themselves.

## Where to make changes

- Add or rename slash commands in `discord/commands.js` and implement their behavior in `discord/interactions.js` or `discord/setup.js`. Run `npm run register` after changing definitions.
- Adjust verification buttons and message components in `discord/components.js`.
- Change sign-in or subscription verification in `routes/oauth.js`; change creator-account lookup in `services/youtube.js`.
- Change collections and indexes in `database/`; initialize new indexes with `npm run db:init:production` before deploying dependent code.
- Change environment requirements or verification policy in `config/runtime.js`.
- Change deployment/setup tooling in `cli/`. CLI modules and `config/local-env.js` are not imported into the Worker, so local filesystem reads and secrets remain outside the runtime bundle.

The Worker URL, OAuth callback paths, npm commands, MongoDB collections, and saved configuration do not change as part of this reorganization.

# Project structure

```text
src/
  index.js                         Worker entry point
  app.js                           HTTP routing and scheduled cleanup
  events/client/
    InteractionCreate.js           Command dispatch, buttons, modals, deferred completion
  commands/
    index.js                       Explicit command registry for Worker bundling
    verify.js                      Screenshot submission and automatic checks
    panel.js                       Post verification instructions
    channel.js                     Submission/review channel command
    getrole.js                     Reward-role command
    verification-status.js         Member status and role retry
    verification-panel.js          Panel alias
    youtube/
      index.js                     Definition and subcommand dispatch
      setup.js                     Creator setup entry
      view.js                      Current creator
      help.js                      Components V2 help
    tiktok/
      index.js
      setup.js
      view.js
      help.js
    shared/setup.js                Shared setup permissions and configuration validation
  components/
    index.js                       UI exports
    content.js                     Interaction content responses
    controls.js                    Rows, buttons and upload modals
    embed.js                       Verification panel embed
    v2.js                          Text displays, containers and Components V2 payloads
  discord/                         REST client, channel permissions, role assignment
  routes/                          Signed interaction ingress and health endpoint
  services/                        Screenshot downloads, AI scan, YouTube lookup
  database/                        MongoDB connections, indexes, transactions
  config/                          Runtime configuration and CLI environment loader
  cli/                             Register, setup, secrets and database tools
  http/                            Provider requests and HTTP responses
  shared/                          Signature verification and security utilities
```

The HTTP route validates Discord signatures and acknowledges interactions before opening MongoDB. InteractionCreate dispatches slash commands through the explicit registry; button and modal events share the same signed route. Each command exports its Discord definition as data and its handler as execute. Creator commands dispatch setup, view and help from their own folders. Register definitions after changes with npm run register.

This deployment receives Discord interactions over HTTP, without a persistent Gateway client. Discord Gateway Ready and MessageCreate events are not received here, so no inactive handlers are included. Normal channel image messages do not trigger verification: members submit through /verify or the panel upload buttons. A future Gateway adapter would need its own persistent runtime and could reuse commands, services and UI builders. The /health endpoint reports Worker/database readiness.

UI builders keep plain content, legacy embeds and Components V2 separate. Components V2 help uses flag 32768 and text/container components without legacy content or embeds. Existing panels retain their embeds and working upload buttons.

Screenshot copies are stored in the private Discord review channel. Cloudflare Workers AI scans clear creator handles and subscription/follow states, with uncertain results and provider failures left for staff. Approval is persisted transactionally before awarding a role. Image matching cannot prove account ownership or reliably detect every forgery. YouTube automatic checks need YOUTUBE_API_KEY to resolve the canonical creator handle.

Database schema, saved targets, roles, channels and environment settings are preserved by this restructuring. Local environment files, .wrangler, node_modules and dist remain ignored. OAuth routes are retired.

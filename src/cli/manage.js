import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { localEnv, keys, root } from "../config/local-env.js";
import { configureLocalDns } from "../config/local-dns.js";
import { configIssues } from "../config/runtime.js";
import {
  databaseIssues,
  withStore,
  initializeDatabase,
  checkDatabase,
} from "../database/connection.js";

function validate(issues) {
  if (issues.length) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
}
async function upload(env) {
  const databaseOnly = process.argv.includes("--database-only");
  const issues = [
    ...(databaseOnly ? [] : configIssues(env, { setup: true })),
    ...databaseIssues(env),
  ];
  if (
    !databaseOnly &&
    (env.PUBLIC_URL?.includes("YOUR-SUBDOMAIN") ||
      !env.PUBLIC_URL?.startsWith("https://"))
  )
    issues.push("Set PUBLIC_URL to your deployed HTTPS Worker URL");
  validate(issues);
  const selected = databaseOnly ? ["MONGODB_URI", "MONGODB_DB_NAME"] : keys;
  const secrets = Object.fromEntries(
    selected.filter((key) => env[key]?.trim()).map((key) => [key, env[key]]),
  );
  // Pass secrets only through stdin, never arguments, logs, or temporary files.
  await new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve(root, "node_modules/wrangler/bin/wrangler.js"),
        "secret",
        "bulk",
      ],
      { cwd: root, stdio: ["pipe", "inherit", "inherit"], env: process.env },
    );
    child.stdin.on("error", () => {});
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? accept() : reject(new Error("Secret upload failed")),
    );
    child.stdin.end(JSON.stringify(secrets));
  });
}
async function endpoint(env) {
  validate(
    ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_PUBLIC_KEY", "PUBLIC_URL"]
      .filter((key) => !env[key]?.trim())
      .map((key) => `Missing ${key}`),
  );
  const url = new URL("/interactions", env.PUBLIC_URL);
  if (url.protocol !== "https:") throw new Error("HTTPS required");
  const headers = {
    Authorization: `Bot ${env.DISCORD_TOKEN}`,
    "Content-Type": "application/json",
  };
  const current = await fetch("https://discord.com/api/v10/applications/@me", {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!current.ok) throw new Error("Could not read application");
  const app = await current.json();
  if (
    app.id !== env.DISCORD_CLIENT_ID ||
    app.verify_key !== env.DISCORD_PUBLIC_KEY
  )
    throw new Error("Application identity mismatch");
  if (app.interactions_endpoint_url === url.href)
    return console.log("Discord interactions endpoint is already configured.");
  const response = await fetch("https://discord.com/api/v10/applications/@me", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ interactions_endpoint_url: url.href }),
    signal: AbortSignal.timeout(15000),
  });
  if (
    !response.ok ||
    (await response.json()).interactions_endpoint_url !== url.href
  )
    throw new Error("Endpoint was not saved");
  console.log("Discord validated and saved the Worker interactions endpoint.");
}
const command = process.argv[2];
if (
  ![
    "db:init",
    "db:check",
    "setup:check",
    "secrets:upload",
    "endpoint:setup",
  ].includes(command)
) {
  console.error(
    "Usage: node src/cli/manage.js <db:init|db:check|setup:check|secrets:upload|endpoint:setup> [--env-file=.env.production] [--database-only]",
  );
  process.exit(1);
}
try {
  const env = localEnv();
  if (command === "setup:check") {
    const issues = [
      ...configIssues(env, { setup: true }),
      ...databaseIssues(env),
    ];
    if (env.PUBLIC_URL?.includes("YOUR-SUBDOMAIN"))
      issues.push("Set PUBLIC_URL to your deployed Worker URL");
    validate(issues);
    console.log(
      "Core configuration looks valid. Check MongoDB with db:check and configure creator accounts and the access role in Discord.",
    );
  } else if (command === "secrets:upload") await upload(env);
  else if (command === "endpoint:setup") await endpoint(env);
  else {
    validate(databaseIssues(env));
    configureLocalDns(env);
    await withStore(
      env,
      async (store) => {
        if (command === "db:init") await initializeDatabase(store.db);
        await checkDatabase(store);
      },
      { allowUninitialized: command === "db:init" },
    );
    console.log(
      command === "db:init"
        ? "MongoDB initialized; indexes and transaction support verified."
        : "MongoDB connection, indexes, and transaction support verified.",
    );
  }
} catch (error) {
  // Never print arbitrary driver messages: they can contain credentials.
  console.error(
    `${command} failed (${error.name}). Check the selected configuration file, credentials, network access, and required permissions.`,
  );
  const guidance = new Map([
    [
      "Selected environment file does not exist",
      "The selected environment file is missing. Create .env.production in the project root, or select an existing file with --env-file=... .",
    ],
    [
      "Initialize MongoDB indexes with db:init before using the bot",
      "The selected database has not been initialized. Run npm run db:init:production for .env.production, or db:init with the same --env-file option.",
    ],
    [
      "Run npm run db:init to create the MongoDB indexes",
      "Required indexes are missing. Run db:init with the same environment file.",
    ],
    [
      "MongoDB replica set or Atlas cluster required for transactions",
      "This database does not support the required transactions. Use MongoDB Atlas or a replica set.",
    ],
  ]);
  if (guidance.has(error.message)) console.error(guidance.get(error.message));
  // Inspect nested network failures, including each server selection failure.
  const pending = [error];
  const seen = new Set();
  const hints = new Set();
  const codes = new Map([
    [
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      'TLS certificate verification failed. Retry with NODE_OPTIONS="--use-system-ca"; if it persists, check the trusted CA certificates on this machine.',
    ],
    [
      "SELF_SIGNED_CERT_IN_CHAIN",
      "The TLS certificate chain includes an untrusted certificate. Check the trusted CA certificates on this machine.",
    ],
    [
      "ENOTFOUND",
      "MongoDB DNS lookup failed. Check the connection string hostname and DNS access.",
    ],
    [
      "ECONNREFUSED",
      "MongoDB refused the connection. Check that the cluster is running and network access is permitted.",
    ],
    [
      "ETIMEDOUT",
      "MongoDB connection timed out. Check the firewall and Atlas Network Access list.",
    ],
    [
      18,
      "MongoDB authentication failed. Check the database username, password, and authentication database.",
    ],
    [
      13,
      "The database user lacks permission for this operation. Check its roles for the selected database.",
    ],
    [
      11000,
      "Existing duplicate records prevent creating a required unique index. Review duplicates before initializing again.",
    ],
  ]);
  while (pending.length) {
    const item = pending.pop();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    if (codes.has(item.code)) hints.add(codes.get(item.code));
    pending.push(item.cause);
    if (item.reason?.servers instanceof Map)
      for (const server of item.reason.servers.values())
        pending.push(server.error);
  }
  for (const hint of hints) console.error(hint);
  process.exitCode = 1;
}

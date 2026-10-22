import { spawn } from "node:child_process";
import { setServers } from "node:dns";
import { resolve } from "node:path";
import { localEnv, keys, root } from "../config/local-env.js";
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
    setServers(["1.1.1.1", "1.0.0.1"]);
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
  // Driver/network error messages can contain credentials; only log the type.
  console.error(
    `${command} failed (${error.name}). Check the selected configuration file, credentials, network access, and required permissions.`,
  );
  process.exitCode = 1;
}

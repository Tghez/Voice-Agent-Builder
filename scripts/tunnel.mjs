/**
 * Starts the ngrok tunnel that Vapi's webhooks call back into.
 *
 * The public URL is NOT hardcoded here — it's derived from NEXT_PUBLIC_BASE_URL
 * (.env.local, gitignored) so the committed script carries no personal domain.
 * A reserved *.ngrok-free.dev / *.ngrok.app host is pinned via --domain, so the
 * URL stays stable across restarts and the Vapi webhook config never goes stale.
 */
import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "3000";
const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "";

let domain = null;
try {
  const { hostname } = new URL(raw);
  if (hostname.endsWith(".ngrok-free.dev") || hostname.endsWith(".ngrok.app")) {
    domain = hostname;
  }
} catch {
  // not a URL — fall through to an ephemeral tunnel
}

if (!domain) {
  console.warn(
    `[tunnel] NEXT_PUBLIC_BASE_URL ("${raw}") is not a reserved ngrok host — ` +
      `starting an ephemeral tunnel. Copy the printed URL into .env.local and ` +
      `into the Vapi webhook settings, or the webhooks won't reach you.`,
  );
}

const args = ["http", PORT, "--log=stdout", ...(domain ? [`--domain=${domain}`] : [])];
const child = spawn("ngrok", args, { stdio: "inherit", shell: process.platform === "win32" });

child.on("error", (err) => {
  console.error(`[tunnel] failed to start ngrok: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));

/**
 * Seed the `leads` table from the shared SEED_LEADS dataset, forcing every phone
 * to DEMO_PHONE. Idempotent (upsert on id).
 *
 * Run: npm run seed   (loads .env.local via node --env-file)
 */
import { serviceClient } from "../src/lib/db/client";
import { SEED_LEADS } from "../src/lib/providers/seedLeads";
import { demoPhone } from "../src/lib/providers/crm";

async function main() {
  const db = serviceClient();
  const phone = demoPhone();
  const rows = SEED_LEADS.map((l) => ({ ...l, phone }));

  const { error } = await db.from("leads").upsert(rows, { onConflict: "id" });
  if (error) throw error;

  const { count, error: countErr } = await db
    .from("leads")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;

  console.log(`Seeded ${rows.length} leads (phone -> ${phone}); table has ${count}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e.message ?? e);
    process.exit(1);
  });

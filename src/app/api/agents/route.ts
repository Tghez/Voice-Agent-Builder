import { NextResponse } from "next/server";
import { listAgents } from "@/lib/db/repositories/agents";

export async function GET() {
  try {
    return NextResponse.json({ agents: await listAgents() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

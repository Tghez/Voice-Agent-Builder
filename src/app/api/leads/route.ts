import { NextResponse } from "next/server";
import { getCRM } from "@/lib/providers/crm";

export async function GET() {
  try {
    const leads = await getCRM().listLeads();
    return NextResponse.json({ leads });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

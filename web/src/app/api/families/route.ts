import { NextResponse } from "next/server";
import { getFamilies } from "@/lib/db/queries";

export async function GET() {
  const families = await getFamilies();
  return NextResponse.json({ families });
}

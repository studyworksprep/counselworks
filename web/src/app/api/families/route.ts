import { NextResponse } from "next/server";
import { getFamiliesForSelect } from "@/lib/db/queries";

export async function GET() {
  const families = await getFamiliesForSelect();
  return NextResponse.json({ families });
}

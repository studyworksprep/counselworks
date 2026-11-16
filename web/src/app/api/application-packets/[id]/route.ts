import { getApplicationFinalReview } from "@/lib/db/queries";
import { submissionPacketText } from "@/lib/applications/final-review";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const applicationId = new URL(request.url).searchParams.get("application");
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (
    !z.uuid().safeParse(id).success ||
    !z.uuid().safeParse(applicationId).success
  )
    return new Response("Packet not found", { status: 404, headers });
  const data = await getApplicationFinalReview(applicationId!);
  const packet = data?.packets.find((item) => item.id === id);
  if (
    !packet ||
    !packet.student_approved_at ||
    !packet.counselor_approved_at ||
    (packet.current === false && !packet.submitted_on)
  ) {
    return new Response("An accessible approved packet is required", {
      status: 404,
      headers,
    });
  }
  return new Response(submissionPacketText(packet), {
    headers: {
      ...headers,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="application-packet-${packet.number}.txt"`,
    },
  });
}

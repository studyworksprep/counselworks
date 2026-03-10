import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    );
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: { type: string; data: Record<string, unknown> };

  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as { type: string; data: Record<string, unknown> };
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  const eventType = evt.type;

  switch (eventType) {
    case "user.created": {
      // TODO: Sync user to database
      console.log("User created:", evt.data.id);
      break;
    }
    case "user.updated": {
      // TODO: Sync user updates to database
      console.log("User updated:", evt.data.id);
      break;
    }
    case "organization.created": {
      // TODO: Create firm record
      console.log("Organization created:", evt.data.id);
      break;
    }
    case "organizationMembership.created": {
      // TODO: Create firm membership
      console.log("Org membership created:", evt.data.id);
      break;
    }
    default: {
      console.log("Unhandled webhook event:", eventType);
    }
  }

  return NextResponse.json({ received: true });
}

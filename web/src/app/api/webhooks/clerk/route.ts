import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServerClient } from "@/lib/db/client";

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

  const db = createServerClient();
  const eventType = evt.type;

  switch (eventType) {
    case "user.created":
    case "user.updated": {
      const data = evt.data;
      const clerkId = data.id as string;
      const emailAddresses = data.email_addresses as Array<{
        email_address: string;
        id: string;
      }>;
      const primaryEmailId = data.primary_email_address_id as string;
      const primaryEmail =
        emailAddresses.find((e) => e.id === primaryEmailId)?.email_address ??
        emailAddresses[0]?.email_address;

      if (!primaryEmail) {
        console.error("No email found for user:", clerkId);
        break;
      }

      // Check if an invited/placeholder user already exists with this email.
      // If so, update their auth_provider_user_id to the real Clerk ID so
      // they inherit their existing firm membership.
      const { data: existingUser } = await db
        .from("users")
        .select("id, auth_provider_user_id")
        .eq("email", primaryEmail)
        .single();

      if (
        existingUser &&
        existingUser.auth_provider_user_id.startsWith("invited_")
      ) {
        const { error } = await db
          .from("users")
          .update({
            auth_provider_user_id: clerkId,
            first_name: (data.first_name as string) || "User",
            last_name: (data.last_name as string) || "",
            last_login_at: new Date().toISOString(),
          })
          .eq("id", existingUser.id);

        if (error) {
          console.error("Failed to link invited user:", error);
          return NextResponse.json(
            { error: "Failed to sync user" },
            { status: 500 }
          );
        }
      } else {
        const { error } = await db.from("users").upsert(
          {
            auth_provider_user_id: clerkId,
            email: primaryEmail,
            first_name: (data.first_name as string) || "User",
            last_name: (data.last_name as string) || "",
            last_login_at: new Date().toISOString(),
          },
          { onConflict: "auth_provider_user_id" }
        );

        if (error) {
          console.error("Failed to upsert user:", error);
          return NextResponse.json(
            { error: "Failed to sync user" },
            { status: 500 }
          );
        }
      }
      break;
    }

    case "organization.created": {
      const data = evt.data;
      const orgName = data.name as string;
      const orgSlug =
        (data.slug as string) ||
        orgName.toLowerCase().replace(/\s+/g, "-");
      const createdBy = data.created_by as string;

      const { data: user } = await db
        .from("users")
        .select("id")
        .eq("auth_provider_user_id", createdBy)
        .single();

      const { data: firm, error: firmError } = await db
        .from("firms")
        .insert({ name: orgName, slug: orgSlug })
        .select("id")
        .single();

      if (firmError) {
        console.error("Failed to create firm:", firmError);
        break;
      }

      await db.from("firm_settings").insert({ firm_id: firm.id });

      if (user) {
        await db.from("firm_memberships").insert({
          firm_id: firm.id,
          user_id: user.id,
          role: "firm_owner",
          status: "active",
          joined_at: new Date().toISOString(),
        });
      }
      break;
    }

    case "organizationMembership.created": {
      const data = evt.data;
      const orgData = data.organization as Record<string, unknown>;
      const publicUserData = data.public_user_data as Record<string, unknown>;
      const clerkUserId = publicUserData?.user_id as string;
      const clerkOrgSlug = orgData?.slug as string;
      const role =
        (data.role as string) === "admin" ? "firm_admin" : "counselor";

      if (!clerkUserId || !clerkOrgSlug) break;

      const { data: user } = await db
        .from("users")
        .select("id")
        .eq("auth_provider_user_id", clerkUserId)
        .single();

      const { data: firm } = await db
        .from("firms")
        .select("id")
        .eq("slug", clerkOrgSlug)
        .single();

      if (user && firm) {
        await db.from("firm_memberships").upsert(
          {
            firm_id: firm.id,
            user_id: user.id,
            role,
            status: "active",
            joined_at: new Date().toISOString(),
          },
          { onConflict: "firm_id,user_id" }
        );
      }
      break;
    }

    default: {
      console.log("Unhandled webhook event:", eventType);
    }
  }

  return NextResponse.json({ received: true });
}

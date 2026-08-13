"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServerClient } from "../db/client";
import { findClientLinkageByEmail } from "../auth/resolve";
import { recordAuditEvent } from "../audit";

// Both actions run before the caller has any firm membership, so RLS cannot
// apply to them yet. Service role (allowlisted): identity bootstrap — the
// same class as resolveUserAndFirm's claim path (docs/SECURITY.md).

/**
 * /welcome guided link (fix plan 2.2): a Clerk-verified signup whose email
 * matches a client record the firm created (family member or student who was
 * added but never formally invited) explicitly links their new login to that
 * record. Trust basis: Clerk verified the mailbox, and the address is the
 * one the firm's staff entered — the same evidence the invitation claim path
 * uses, plus the user's explicit confirmation.
 */
export async function linkClientAccount() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { error: "Not authenticated" };

  let clerkUser: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    clerkUser = await currentUser();
  } catch (e) {
    console.error("Clerk currentUser() failed during linking:", e);
    return { error: "Could not verify your account — try again" };
  }
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return { error: "Your account has no verified email address" };

  // Re-derive the linkage server-side from the verified email — never from
  // client input.
  const linkage = await findClientLinkageByEmail(email);
  if (!linkage) {
    return { error: "No client records match your email address" };
  }

  const db = createServerClient();

  // Claim the placeholder. The invited_ guard makes this a no-op if another
  // request (or the invitation flow) claimed it first.
  const { data: claimed } = await db
    .from("users")
    .update({
      auth_provider_user_id: clerkUserId,
      first_name: clerkUser?.firstName || undefined,
      last_name: clerkUser?.lastName || undefined,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", linkage.placeholderUserId)
    .like("auth_provider_user_id", "invited\\_%")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    // Already claimed. If it was claimed by THIS login (double submit), the
    // membership insert below still converges; anything else is a conflict.
    const { data: current } = await db
      .from("users")
      .select("auth_provider_user_id")
      .eq("id", linkage.placeholderUserId)
      .maybeSingle();
    if (current?.auth_provider_user_id !== clerkUserId) {
      return { error: "This client record is already linked to another login" };
    }
  }

  const role = linkage.kind === "student" ? "student" : "parent_guardian";
  const { error: memberError } = await db.from("firm_memberships").insert({
    firm_id: linkage.firmId,
    user_id: linkage.placeholderUserId,
    role,
    status: "active",
    joined_at: new Date().toISOString(),
  });
  // 23505 = the membership already exists (pre-staged or double submit) —
  // converged, not a failure.
  if (memberError && memberError.code !== "23505") {
    console.error("Failed to create linked membership:", memberError);
    return { error: "Failed to link your account" };
  }

  // Any pending invitations for this placeholder are satisfied by the link.
  const acceptedAt = new Date().toISOString();
  await Promise.all([
    db
      .from("student_invitations")
      .update({ status: "accepted", accepted_at: acceptedAt })
      .eq("placeholder_user_id", linkage.placeholderUserId)
      .eq("status", "pending"),
    db
      .from("family_invitations")
      .update({ status: "accepted", accepted_at: acceptedAt })
      .eq("placeholder_user_id", linkage.placeholderUserId)
      .eq("status", "pending"),
  ]);

  await recordAuditEvent(db, {
    firmId: linkage.firmId,
    actorUserId: linkage.placeholderUserId,
    entityType: "user",
    entityId: linkage.placeholderUserId,
    actionType: "portal_account_linked",
    label: `Portal account self-linked via verified email (${linkage.kind})`,
  });

  redirect(role === "student" ? "/student-dashboard" : "/family-dashboard");
}

/**
 * /welcome explicit firm creation (fix plan 2.2): the ONLY way a firm is
 * provisioned. Deliberate action with a chosen name — never a side effect of
 * signing in. Migration 00034's unique index backstops the concurrent case.
 */
export async function createFirmForCurrentUser(formData: FormData) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { error: "Not authenticated" };

  const firmName = ((formData.get("firm_name") as string) || "").trim();
  if (!firmName) return { error: "Firm name is required" };

  let clerkUser: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    clerkUser = await currentUser();
  } catch (e) {
    console.error("Clerk currentUser() failed during firm creation:", e);
    return { error: "Could not verify your account — try again" };
  }
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return { error: "Your account has no verified email address" };

  // Known client records take the guided-link path, never a new firm — the
  // exact misfire this flow replaces (a parent clicking through from an
  // agreement email became the owner of an empty firm).
  const linkage = await findClientLinkageByEmail(email);
  if (linkage) {
    return {
      error: `Your email is on file with ${linkage.firmName}. Link your account to them instead.`,
    };
  }

  const db = createServerClient();

  // Ensure a users row for this login (webhook may not have fired yet).
  let { data: user } = await db
    .from("users")
    .select("id")
    .eq("auth_provider_user_id", clerkUserId)
    .maybeSingle();
  if (!user) {
    const { data: inserted, error: userError } = await db
      .from("users")
      .insert({
        auth_provider_user_id: clerkUserId,
        email,
        first_name: clerkUser?.firstName || "User",
        last_name: clerkUser?.lastName || "",
        last_login_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (userError?.code === "23505") {
      // Concurrent first-request race on auth_provider_user_id: adopt.
      const { data: raced } = await db
        .from("users")
        .select("id")
        .eq("auth_provider_user_id", clerkUserId)
        .maybeSingle();
      if (!raced) return { error: "Failed to set up your account" };
      user = raced;
    } else if (userError || !inserted) {
      console.error("Failed to create user for firm setup:", userError);
      return { error: "Failed to set up your account" };
    } else {
      user = inserted;
    }
  }

  const firmSlug = `firm-${clerkUserId.slice(-8)}-${Date.now()}`;
  const { data: firm, error: firmError } = await db
    .from("firms")
    .insert({ name: firmName, slug: firmSlug })
    .select("id")
    .single();
  if (firmError || !firm) {
    console.error("Failed to create firm:", firmError);
    return { error: "Failed to create your firm" };
  }
  await db.from("firm_settings").insert({ firm_id: firm.id });

  const { error: memberError } = await db.from("firm_memberships").insert({
    firm_id: firm.id,
    user_id: user.id,
    role: "firm_owner",
    status: "active",
    joined_at: new Date().toISOString(),
  });
  if (memberError) {
    // One active ownership per user (migration 00034): a concurrent submit
    // won; drop this request's orphan firm (settings cascade). The winner's
    // request records its own audit event and the caller lands in the
    // winner's firm.
    await db.from("firms").delete().eq("id", firm.id);
    if (memberError.code !== "23505") {
      console.error("Failed to create owner membership:", memberError);
      return { error: "Failed to create your firm" };
    }
    redirect("/dashboard");
  }

  await recordAuditEvent(db, {
    firmId: firm.id,
    actorUserId: user.id,
    entityType: "firm",
    entityId: firm.id,
    actionType: "firm_created",
    label: `Firm created: ${firmName}`,
  });

  redirect("/dashboard");
}

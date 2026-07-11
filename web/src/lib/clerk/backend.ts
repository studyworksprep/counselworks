import { clerkClient } from "@clerk/nextjs/server";

export interface StudentInvitePublicMetadata {
  kind: "student_invite";
  placeholder_user_id: string;
  student_id: string;
  firm_id: string;
}

export interface ParentInvitePublicMetadata {
  kind: "parent_invite";
  placeholder_user_id: string;
  family_id: string;
  family_member_id: string;
  firm_id: string;
}

export type PortalInvitePublicMetadata =
  | StudentInvitePublicMetadata
  | ParentInvitePublicMetadata;

export interface CreatedClerkInvitation {
  id: string;
  url: string;
  status: string;
}

export async function createClerkPortalInvitation(args: {
  emailAddress: string;
  publicMetadata: PortalInvitePublicMetadata;
  redirectUrl: string;
}): Promise<CreatedClerkInvitation> {
  const client = await clerkClient();
  const inv = await client.invitations.createInvitation({
    emailAddress: args.emailAddress,
    publicMetadata:
      args.publicMetadata as unknown as Record<string, unknown>,
    redirectUrl: args.redirectUrl,
    notify: false,
  });

  return {
    id: inv.id,
    url: inv.url ?? "",
    status: inv.status,
  };
}

export async function revokeClerkInvitation(invitationId: string): Promise<void> {
  const client = await clerkClient();
  await client.invitations.revokeInvitation(invitationId);
}

interface ClerkApiErrorDetail {
  code?: string;
  message?: string;
  longMessage?: string;
}

/**
 * Extracts the error detail array from a Clerk API error. Node's console
 * collapses nested arrays ("errors: [Array]"), so call sites should log
 * these explicitly — the code inside is the only way to tell WHY Clerk
 * rejected a request.
 */
export function clerkErrorDetails(e: unknown): ClerkApiErrorDetail[] | null {
  if (!e || typeof e !== "object") return null;
  if (!("clerkError" in e) || !(e as { clerkError?: unknown }).clerkError) {
    return null;
  }
  const errors = (e as { errors?: unknown }).errors;
  return Array.isArray(errors) ? (errors as ClerkApiErrorDetail[]) : null;
}

/**
 * Maps a failed createInvitation call to a message the counselor can act
 * on. Clerk's user/invitation store is separate from our database, so a
 * "cleared" email can still be taken on Clerk's side (stale test accounts).
 */
export function clerkInvitationErrorMessage(e: unknown): string | null {
  const details = clerkErrorDetails(e);
  if (!details || details.length === 0) return null;
  switch (details[0].code) {
    case "form_identifier_exists":
      return "This email already has a sign-in account with the auth provider (Clerk). If it's a leftover from earlier testing, delete the user in the Clerk dashboard, then try again.";
    case "duplicate_record":
      return "The auth provider (Clerk) already has a pending invitation for this email. Revoke it in the Clerk dashboard under Invitations, then try again.";
    default:
      return details[0].longMessage ?? details[0].message ?? null;
  }
}

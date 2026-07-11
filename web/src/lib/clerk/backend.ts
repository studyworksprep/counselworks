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

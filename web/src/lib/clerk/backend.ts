import { clerkClient } from "@clerk/nextjs/server";

export interface StudentInvitePublicMetadata {
  kind: "student_invite";
  placeholder_user_id: string;
  student_id: string;
  firm_id: string;
}

export interface CreatedClerkInvitation {
  id: string;
  url: string;
  status: string;
}

export async function createClerkStudentInvitation(args: {
  emailAddress: string;
  publicMetadata: StudentInvitePublicMetadata;
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

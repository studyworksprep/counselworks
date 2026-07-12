import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_ADDRESS =
  process.env.RESEND_FROM_ADDRESS ?? "CounselWorks <onboarding@resend.dev>";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
  });

  if (error) {
    console.error("Failed to send email via Resend:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }
}

export async function sendInvitationEmail(
  email: string,
  firmName: string,
  inviterName: string,
  inviteUrl: string
): Promise<void> {
  await sendEmail({
    to: email,
    subject: `You've been invited to join ${firmName} on CounselWorks`,
    html: `
      <h2>You've been invited to CounselWorks</h2>
      <p>${inviterName} has invited you to join ${firmName}.</p>
      <p><a href="${inviteUrl}">Accept Invitation</a></p>
    `,
  });
}

export async function sendStudentPortalInviteEmail(args: {
  email: string;
  studentFirstName: string;
  firmName: string;
  counselorName: string;
  inviteUrl: string;
  note?: string | null;
}): Promise<void> {
  const { email, studentFirstName, firmName, counselorName, inviteUrl, note } =
    args;

  const safeNote = note?.trim();
  const noteBlock = safeNote
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #6366f1;background:#f5f5ff;color:#374151;font-style:italic;">${escapeHtml(
        safeNote
      )}</blockquote>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">You're invited to the ${escapeHtml(
        firmName
      )} student portal</h2>
      <p>Hi ${escapeHtml(studentFirstName)},</p>
      <p>${escapeHtml(
        counselorName
      )} has set up a CounselWorks portal account for you. Sign in to track your applications, tasks, and meetings in one place.</p>
      ${noteBlock}
      <p style="margin:24px 0;">
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy this link into your browser:<br/>
        <a href="${inviteUrl}" style="color:#4f46e5;word-break:break-all;">${inviteUrl}</a>
      </p>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;">This invitation was sent to ${escapeHtml(
        email
      )}. If you weren't expecting it, you can ignore this email.</p>
    </div>
  `;

  const text = [
    `Hi ${studentFirstName},`,
    "",
    `${counselorName} has invited you to the ${firmName} student portal on CounselWorks.`,
    safeNote ? "" : null,
    safeNote ? safeNote : null,
    "",
    `Accept here: ${inviteUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  await sendEmail({
    to: email,
    subject: `${counselorName} invited you to the ${firmName} student portal`,
    html,
    text,
  });
}

export async function sendNewMessageNotificationEmail(args: {
  email: string;
  recipientFirstName: string;
  senderName: string;
  firmName: string;
  preview: string;
  portalPath: string;
}): Promise<void> {
  const { email, recipientFirstName, senderName, firmName, preview, portalPath } =
    args;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const link = `${appUrl}${portalPath}`;
  const truncated =
    preview.length > 200 ? `${preview.slice(0, 200)}…` : preview;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">New message from ${escapeHtml(senderName)}</h2>
      <p>Hi ${escapeHtml(recipientFirstName)},</p>
      <p>You have a new message on the ${escapeHtml(firmName)} CounselWorks portal:</p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #6366f1;background:#f5f5ff;color:#374151;">${escapeHtml(
        truncated
      )}</blockquote>
      <p style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Read &amp; reply
        </a>
      </p>
    </div>
  `;

  const text = [
    `Hi ${recipientFirstName},`,
    "",
    `New message from ${senderName} (${firmName}):`,
    truncated,
    "",
    `Read & reply: ${link}`,
  ].join("\n");

  await sendEmail({
    to: email,
    subject: `New message from ${senderName} — ${firmName}`,
    html,
    text,
  });
}

export async function sendFamilyPortalInviteEmail(args: {
  email: string;
  parentFirstName: string;
  studentNames: string;
  firmName: string;
  counselorName: string;
  inviteUrl: string;
  note?: string | null;
}): Promise<void> {
  const {
    email,
    parentFirstName,
    studentNames,
    firmName,
    counselorName,
    inviteUrl,
    note,
  } = args;

  const safeNote = note?.trim();
  const noteBlock = safeNote
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #6366f1;background:#f5f5ff;color:#374151;font-style:italic;">${escapeHtml(
        safeNote
      )}</blockquote>`
    : "";
  const aboutStudents = studentNames
    ? ` Follow ${escapeHtml(studentNames)}'s progress, deadlines, documents, and meetings in one place.`
    : " Follow your student's progress, deadlines, documents, and meetings in one place.";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">You're invited to the ${escapeHtml(
        firmName
      )} family portal</h2>
      <p>Hi ${escapeHtml(parentFirstName)},</p>
      <p>${escapeHtml(
        counselorName
      )} has set up a CounselWorks family portal account for you.${aboutStudents}</p>
      ${noteBlock}
      <p style="margin:24px 0;">
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy this link into your browser:<br/>
        <a href="${inviteUrl}" style="color:#4f46e5;word-break:break-all;">${inviteUrl}</a>
      </p>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;">This invitation was sent to ${escapeHtml(
        email
      )}. If you weren't expecting it, you can ignore this email.</p>
    </div>
  `;

  const text = [
    `Hi ${parentFirstName},`,
    "",
    `${counselorName} has invited you to the ${firmName} family portal on CounselWorks.`,
    safeNote ? "" : null,
    safeNote ? safeNote : null,
    "",
    `Accept here: ${inviteUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  await sendEmail({
    to: email,
    subject: `${counselorName} invited you to the ${firmName} family portal`,
    html,
    text,
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendApplicationDeadlineDigestEmail(
  email: string,
  items: {
    studentName: string;
    collegeName: string;
    round: string;
    deadline: string;
  }[]
): Promise<void> {
  const rows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding:6px 12px 6px 0;color:#111827;">${escapeHtml(i.studentName)}</td>
          <td style="padding:6px 12px 6px 0;color:#111827;font-weight:600;">${escapeHtml(i.collegeName)}</td>
          <td style="padding:6px 12px 6px 0;color:#6b7280;">${escapeHtml(i.round.toUpperCase())}</td>
          <td style="padding:6px 0;color:#b91c1c;">${new Date(i.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">Application deadlines in the next 7 days</h2>
      <p>${items.length} unsubmitted application${items.length === 1 ? "" : "s"} on your caseload ${items.length === 1 ? "is" : "are"} due soon:</p>
      <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
    </div>
  `;
  const text = items
    .map(
      (i) =>
        `${i.studentName} — ${i.collegeName} (${i.round.toUpperCase()}) due ${i.deadline.slice(0, 10)}`
    )
    .join("\n");

  await sendEmail({
    to: email,
    subject: `${items.length} application deadline${items.length === 1 ? "" : "s"} in the next 7 days`,
    html,
    text,
  });
}

export async function sendWorkflowStepReminderEmail(
  email: string,
  steps: {
    title: string;
    studentName: string;
    workflowName: string;
    dueDate: string;
  }[]
): Promise<void> {
  const list = steps
    .map(
      (s) =>
        `<li><strong>${s.title}</strong> — ${s.studentName} (${s.workflowName}), due ${s.dueDate}</li>`
    )
    .join("");

  await sendEmail({
    to: email,
    subject: `${steps.length} workflow step${steps.length === 1 ? "" : "s"} due soon`,
    html: `
      <h2>Workflow steps due soon</h2>
      <p>The following workflow steps are coming up:</p>
      <ul>${list}</ul>
    `,
  });
}

export async function sendAgreementSignatureRequestEmail(args: {
  email: string;
  parentFirstName: string;
  firmName: string;
  agreementTitle: string;
}): Promise<void> {
  const { email, parentFirstName, firmName, agreementTitle } = args;
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}/family-dashboard`;
  await sendEmail({
    to: email,
    subject: `Signature requested: ${agreementTitle}`,
    html: `
      <h2 style="margin-bottom:8px;">Your signature is requested</h2>
      <p>Hi ${escapeHtml(parentFirstName)},</p>
      <p>${escapeHtml(firmName)} has sent you a service agreement
      (<strong>${escapeHtml(agreementTitle)}</strong>) to review and sign
      electronically in your family portal.</p>
      <p><a href="${portalUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Review &amp; sign</a></p>
      <p style="color:#6b7280;font-size:13px;">You'll be asked to consent to
      signing electronically and to type your full legal name.</p>
    `,
    text: `Hi ${parentFirstName}, ${firmName} sent you a service agreement (${agreementTitle}) to review and sign in your family portal: ${portalUrl}`,
  });
}

export async function sendAgreementCompletedEmail(args: {
  email: string;
  signedName: string;
  firmName: string;
  agreementTitle: string;
}): Promise<void> {
  const { email, signedName, firmName, agreementTitle } = args;
  await sendEmail({
    to: email,
    subject: `Fully executed: ${agreementTitle}`,
    html: `
      <h2 style="margin-bottom:8px;">Agreement fully executed</h2>
      <p>Hi ${escapeHtml(signedName)},</p>
      <p><strong>${escapeHtml(agreementTitle)}</strong> between
      ${escapeHtml(firmName)} and your family has been signed by both
      parties. A copy of the signed record (PDF) is available in the
      Documents section of the portal for your records.</p>
    `,
    text: `${agreementTitle} between ${firmName} and your family is fully executed. The signed PDF is available in the portal's Documents section.`,
  });
}

export async function sendMeetingReminderEmail(args: {
  email: string;
  firstName: string;
  meetingTitle: string;
  startsAt: string;
  location: string | null;
  firmName: string;
}): Promise<void> {
  const { email, firstName, meetingTitle, startsAt, location, firmName } = args;
  await sendEmail({
    to: email,
    subject: `Reminder: ${meetingTitle} tomorrow`,
    html: `
      <h2 style="margin-bottom:8px;">Meeting reminder</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p><strong>${escapeHtml(meetingTitle)}</strong> with ${escapeHtml(firmName)}
      is coming up: <strong>${escapeHtml(startsAt)}</strong>${
        location ? ` · ${escapeHtml(location)}` : ""
      }.</p>
    `,
    text: `Hi ${firstName}, reminder: ${meetingTitle} with ${firmName} — ${startsAt}${location ? ` at ${location}` : ""}.`,
  });
}

export async function sendMessageDigestEmail(args: {
  email: string;
  firstName: string;
  firmName: string;
  unreadCount: number;
  portalPath: string;
}): Promise<void> {
  const { email, firstName, firmName, unreadCount, portalPath } = args;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}${portalPath}`;
  await sendEmail({
    to: email,
    subject: `${unreadCount} unread message${unreadCount === 1 ? "" : "s"} — ${firmName}`,
    html: `
      <h2 style="margin-bottom:8px;">Your daily message digest</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>You have <strong>${unreadCount}</strong> unread message${
        unreadCount === 1 ? "" : "s"
      } waiting in ${escapeHtml(firmName)}.</p>
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open messages</a></p>
    `,
    text: `Hi ${firstName}, you have ${unreadCount} unread message(s) in ${firmName}: ${url}`,
  });
}

export async function sendWeeklyFamilyDigestEmail(args: {
  email: string;
  firstName: string;
  firmName: string;
  lines: string[];
}): Promise<void> {
  const { email, firstName, firmName, lines } = args;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}/family-dashboard`;
  await sendEmail({
    to: email,
    subject: `Your weekly progress update — ${firmName}`,
    html: `
      <h2 style="margin-bottom:8px;">This week at a glance</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <ul>
        ${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("\n")}
      </ul>
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open the family portal</a></p>
    `,
    text: `Hi ${firstName}, this week at a glance:\n${lines.map((l) => `- ${l}`).join("\n")}\n${url}`,
  });
}

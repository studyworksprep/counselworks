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

export async function sendDeadlineReminderEmail(
  email: string,
  studentName: string,
  deadlines: { college: string; deadline: string }[]
): Promise<void> {
  const deadlineList = deadlines
    .map((d) => `<li>${d.college}: ${d.deadline}</li>`)
    .join("");

  await sendEmail({
    to: email,
    subject: `Upcoming deadlines for ${studentName}`,
    html: `
      <h2>Upcoming Deadlines</h2>
      <p>The following deadlines are approaching for ${studentName}:</p>
      <ul>${deadlineList}</ul>
    `,
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

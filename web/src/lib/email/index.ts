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

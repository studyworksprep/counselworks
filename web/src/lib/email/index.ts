// Email delivery abstraction
// Configure with Resend, SendGrid, or Postmark

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  // TODO: Implement with chosen email provider (Resend/SendGrid/Postmark)
  console.log("Email send requested:", {
    to: options.to,
    subject: options.subject,
  });
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

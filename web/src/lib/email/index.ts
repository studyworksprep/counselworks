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
  idempotencyKey?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
  }, options.idempotencyKey ? {idempotencyKey:options.idempotencyKey} : undefined);

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
  /** The secure signing link (12.7) — no portal account needed. */
  signingUrl: string;
}): Promise<void> {
  const { email, parentFirstName, firmName, agreementTitle, signingUrl } = args;
  await sendEmail({
    to: email,
    subject: `Signature requested: ${agreementTitle}`,
    html: `
      <h2 style="margin-bottom:8px;">Your signature is requested</h2>
      <p>Hi ${escapeHtml(parentFirstName)},</p>
      <p>${escapeHtml(firmName)} has sent you a service agreement
      (<strong>${escapeHtml(agreementTitle)}</strong>) to review and sign
      electronically. No account or password is needed — the secure link
      below is yours alone.</p>
      <p><a href="${signingUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Review &amp; sign</a></p>
      <p style="color:#6b7280;font-size:13px;">You'll be asked to consent to
      signing electronically and to type your full legal name. Please don't
      forward this email — the link signs on your behalf.</p>
    `,
    text: `Hi ${parentFirstName}, ${firmName} sent you a service agreement (${agreementTitle}) to review and sign. No account needed — use your private link: ${signingUrl}`,
  });
}

export async function sendInvoicesIssuedEmail(args: {
  email: string;
  firstName: string;
  firmName: string;
  agreementTitle: string;
  invoices: {
    invoiceNumber: string;
    installmentLabel: string;
    amountFormatted: string;
    dueOn: string;
  }[];
  /** Where to view and pay: the signing link, or the family dashboard. */
  payUrl: string;
}): Promise<void> {
  const { email, firstName, firmName, agreementTitle, invoices, payUrl } = args;
  const rows = invoices
    .map(
      (i) =>
        `<li><strong>${escapeHtml(i.invoiceNumber)}</strong> — ${escapeHtml(i.installmentLabel)}: ${escapeHtml(i.amountFormatted)}, due ${escapeHtml(i.dueOn)}</li>`
    )
    .join("\n");
  await sendEmail({
    to: email,
    subject: `Your invoices from ${firmName}: ${agreementTitle}`,
    html: `
      <h2 style="margin-bottom:8px;">Your invoices are ready</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p><strong>${escapeHtml(agreementTitle)}</strong> is fully executed, and
      ${escapeHtml(firmName)} has issued the invoices in your payment
      schedule:</p>
      <ul>${rows}</ul>
      <p><a href="${payUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">View &amp; pay</a></p>
      <p style="color:#6b7280;font-size:13px;">Each invoice can be paid
      online by card as it comes due. A receipt is emailed for every
      payment.</p>
    `,
    text: `Hi ${firstName}, ${agreementTitle} is fully executed and ${firmName} issued your invoices:\n${invoices.map((i) => `- ${i.invoiceNumber} — ${i.installmentLabel}: ${i.amountFormatted}, due ${i.dueOn}`).join("\n")}\nView and pay: ${payUrl}`,
  });
}

export async function sendAgreementCompletedEmail(args: {
  email: string;
  signedName: string;
  firmName: string;
  agreementTitle: string;
  /**
   * The secure signing link (12.7) when the agreement has one: the signed
   * text and the invoices live there, no account needed. Absent for staff
   * signers and pre-link agreements, who are pointed at the app.
   */
  viewUrl?: string;
  /** Whether invoices were issued on execution (fee terms present). */
  hasInvoices?: boolean;
}): Promise<void> {
  const { email, signedName, firmName, agreementTitle, hasInvoices } = args;
  const url =
    args.viewUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}/family-dashboard`;
  const invoiceLine = hasInvoices
    ? " Your invoices from the payment schedule have been issued and can be viewed — and paid online once the firm enables payments — from the same link."
    : "";
  await sendEmail({
    to: email,
    subject: `Fully executed: ${agreementTitle}`,
    html: `
      <h2 style="margin-bottom:8px;">Agreement fully executed</h2>
      <p>Hi ${escapeHtml(signedName)},</p>
      <p><strong>${escapeHtml(agreementTitle)}</strong> between
      ${escapeHtml(firmName)} and your family has been signed by both
      parties.${escapeHtml(invoiceLine)}</p>
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">View signed agreement${hasInvoices ? " &amp; invoices" : ""}</a></p>
      <p style="color:#6b7280;font-size:13px;">Keep this email — the link
      is your record of the executed agreement.</p>
    `,
    text: `${agreementTitle} between ${firmName} and your family is fully executed.${invoiceLine} View it here: ${url}`,
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

/**
 * Self-booking (fix plan 13.1): the counselor learns a family booked a slot
 * (in-app notification too), and the parent gets a confirmation.
 */
export async function sendMeetingBookedStaffEmail(args: {
  email: string;
  firstName: string;
  bookedByName: string;
  studentName: string;
  startsAt: string;
  location: string | null;
  note: string | null;
  meetingUrl: string;
}): Promise<void> {
  const { email, firstName, bookedByName, studentName, startsAt, location, note, meetingUrl } = args;
  await sendEmail({
    to: email,
    subject: `${bookedByName} booked a meeting: ${startsAt}`,
    html: `
      <h2 style="margin-bottom:8px;">New meeting booked</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p><strong>${escapeHtml(bookedByName)}</strong> booked a meeting about
      <strong>${escapeHtml(studentName)}</strong> for
      <strong>${escapeHtml(startsAt)}</strong>${location ? ` · ${escapeHtml(location)}` : ""}.</p>
      ${note ? `<p style="color:#4b5563;">Note from the family: ${escapeHtml(note)}</p>` : ""}
      <p><a href="${escapeHtml(meetingUrl)}">Open your calendar</a></p>
    `,
    text: `Hi ${firstName}, ${bookedByName} booked a meeting about ${studentName} for ${startsAt}${location ? ` at ${location}` : ""}.${note ? ` Note: ${note}` : ""} ${meetingUrl}`,
  });
}

export async function sendMeetingBookedFamilyEmail(args: {
  email: string;
  firstName: string;
  counselorName: string;
  studentName: string;
  startsAt: string;
  location: string | null;
  firmName: string;
  portalUrl: string;
}): Promise<void> {
  const { email, firstName, counselorName, studentName, startsAt, location, firmName, portalUrl } = args;
  await sendEmail({
    to: email,
    subject: `Meeting confirmed: ${startsAt}`,
    html: `
      <h2 style="margin-bottom:8px;">Your meeting is booked</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your meeting with <strong>${escapeHtml(counselorName)}</strong> (${escapeHtml(firmName)})
      about <strong>${escapeHtml(studentName)}</strong> is confirmed for
      <strong>${escapeHtml(startsAt)}</strong>${location ? ` · ${escapeHtml(location)}` : ""}.</p>
      <p>Need to reschedule? Message your counselor from the portal.</p>
      <p><a href="${escapeHtml(portalUrl)}">Open the family portal</a></p>
    `,
    text: `Hi ${firstName}, your meeting with ${counselorName} (${firmName}) about ${studentName} is confirmed for ${startsAt}${location ? ` at ${location}` : ""}. To reschedule, message your counselor from the portal: ${portalUrl}`,
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

export async function sendDocumentRequestReminderEmail(args: {
  email: string;
  firstName: string;
  firmName: string;
  title: string;
  overdue: boolean;
  portalPath: string;
}): Promise<void> {
  const { email, firstName, firmName, title, overdue, portalPath } = args;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}${portalPath}`;
  await sendEmail({
    to: email,
    subject: overdue
      ? `Still needed: ${title} — ${firmName}`
      : `Reminder: ${title} — ${firmName}`,
    html: `
      <h2 style="margin-bottom:8px;">Document ${overdue ? "still needed" : "reminder"}</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>${escapeHtml(firmName)} ${
        overdue ? "is still waiting on" : "asked for"
      } <strong>${escapeHtml(title)}</strong>. You can upload it from your portal.</p>
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Upload document</a></p>
    `,
    text: `Hi ${firstName}, ${firmName} ${overdue ? "is still waiting on" : "asked for"} "${title}". Upload it here: ${url}`,
  });
}

export async function sendPaymentReceiptEmail(args: {
  email: string;
  firstName: string;
  firmName: string;
  invoiceNumber: string;
  installmentLabel: string;
  amountFormatted: string;
  /** Remaining balance after this payment; null/undefined = settled in full. */
  balanceFormatted?: string | null;
  /** How the payment arrived; "card" (the default) mentions the statement. */
  methodLabel?: string;
  /** Where the payer can see the paid invoice; defaults to the portal. */
  viewUrl?: string;
}): Promise<void> {
  const { email, firstName, firmName, invoiceNumber, installmentLabel, amountFormatted } = args;
  const url =
    args.viewUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}/family-dashboard`;
  const settled = !args.balanceFormatted;
  const outcome = settled
    ? "The invoice is now marked paid."
    : `The remaining balance on this invoice is <strong>${escapeHtml(args.balanceFormatted!)}</strong>.`;
  const outcomeText = settled
    ? "The invoice is now paid."
    : `Remaining balance: ${args.balanceFormatted}.`;
  const footer = args.methodLabel
    ? `Recorded by ${escapeHtml(firmName)} as: ${escapeHtml(args.methodLabel)}.`
    : `The charge appears on your statement from ${escapeHtml(firmName)}.`;
  await sendEmail({
    to: email,
    subject: `Payment received: ${invoiceNumber} — ${firmName}`,
    html: `
      <h2 style="margin-bottom:8px;">Payment received</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your payment of <strong>${escapeHtml(amountFormatted)}</strong> to
      ${escapeHtml(firmName)} for invoice
      <strong>${escapeHtml(invoiceNumber)}</strong>
      (${escapeHtml(installmentLabel)}) has been received. ${outcome}</p>
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">View invoices</a></p>
      <p style="color:#6b7280;font-size:13px;">${footer}</p>
    `,
    text: `Hi ${firstName}, your ${amountFormatted} payment to ${firmName} for invoice ${invoiceNumber} (${installmentLabel}) was received. ${outcomeText} ${url}`,
  });
}

/**
 * An invoice was credited or voided by the firm (post-plan billing
 * adjustments): the household learns what changed, why, and what is still
 * owed — an invoice they were told about never silently changes.
 */
export async function sendInvoiceAdjustedEmail(args: {
  email: string;
  firstName: string;
  firmName: string;
  invoiceNumber: string;
  installmentLabel: string;
  kind: "credit" | "void";
  /** The credit amount; unused for void. */
  amountFormatted?: string;
  reason: string;
  /** Remaining balance after the adjustment; null = nothing owed. */
  balanceFormatted: string | null;
  viewUrl?: string;
}): Promise<void> {
  const { email, firstName, firmName, invoiceNumber, installmentLabel, reason } = args;
  const url =
    args.viewUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}/family-dashboard`;
  const headline = args.kind === "void" ? "Invoice voided" : "Credit applied";
  const what =
    args.kind === "void"
      ? `${escapeHtml(firmName)} has voided invoice <strong>${escapeHtml(invoiceNumber)}</strong> (${escapeHtml(installmentLabel)}). Nothing is owed on it.`
      : `${escapeHtml(firmName)} has applied a credit of <strong>${escapeHtml(args.amountFormatted ?? "")}</strong> to invoice <strong>${escapeHtml(invoiceNumber)}</strong> (${escapeHtml(installmentLabel)}).`;
  const balanceLine =
    args.kind === "void"
      ? ""
      : args.balanceFormatted
        ? `<p>Remaining balance on this invoice: <strong>${escapeHtml(args.balanceFormatted)}</strong>.</p>`
        : `<p>This invoice is now settled in full.</p>`;
  await sendEmail({
    to: email,
    subject: `${headline}: ${invoiceNumber} — ${firmName}`,
    html: `
      <h2 style="margin-bottom:8px;">${headline}</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>${what}</p>
      <p>Reason: ${escapeHtml(reason)}</p>
      ${balanceLine}
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">View invoices</a></p>
    `,
    text: `Hi ${firstName}, ${firmName} ${args.kind === "void" ? "voided" : `applied a ${args.amountFormatted ?? ""} credit to`} invoice ${invoiceNumber} (${installmentLabel}). Reason: ${reason}. ${args.balanceFormatted ? `Remaining balance: ${args.balanceFormatted}.` : ""} ${url}`,
  });
}

export async function sendPaymentReceivedFirmEmail(args: {
  email: string;
  firmName: string;
  familyName: string;
  invoiceNumber: string;
  amountFormatted: string;
  /** Remaining balance after this payment; null/undefined = settled. */
  balanceFormatted?: string | null;
}): Promise<void> {
  const { email, firmName, familyName, invoiceNumber, amountFormatted } = args;
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}/reports`;
  const remaining = args.balanceFormatted
    ? ` ${escapeHtml(args.balanceFormatted)} remains open on this invoice.`
    : "";
  await sendEmail({
    to: email,
    subject: `${familyName} paid ${invoiceNumber} (${amountFormatted})`,
    html: `
      <h2 style="margin-bottom:8px;">${args.balanceFormatted ? "Partial payment received" : "Invoice paid"}</h2>
      <p><strong>${escapeHtml(familyName)}</strong> paid
      ${escapeHtml(amountFormatted)} on invoice
      <strong>${escapeHtml(invoiceNumber)}</strong>.${remaining} Funds settle to
      ${escapeHtml(firmName)}'s connected Stripe account on its payout
      schedule.</p>
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open CounselWorks</a></p>
    `,
    text: `${familyName} paid invoice ${invoiceNumber} (${amountFormatted}).`,
  });
}

export async function sendInvoiceOverdueReminderEmail(args: {
  email: string;
  firstName: string;
  firmName: string;
  invoiceNumber: string;
  installmentLabel: string;
  amountFormatted: string;
  dueOn: string;
  daysOverdue: number;
  /** Where to pay: the signing link when the agreement has one, else the portal. */
  payUrl: string;
}): Promise<void> {
  const {
    email,
    firstName,
    firmName,
    invoiceNumber,
    installmentLabel,
    amountFormatted,
    dueOn,
    daysOverdue,
    payUrl: url,
  } = args;
  const overdueText = `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past due`;
  await sendEmail({
    to: email,
    subject: `Payment reminder: ${invoiceNumber} (${amountFormatted}) — ${firmName}`,
    html: `
      <h2 style="margin-bottom:8px;">Payment reminder</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Invoice <strong>${escapeHtml(invoiceNumber)}</strong>
      (${escapeHtml(installmentLabel)}) from ${escapeHtml(firmName)} for
      <strong>${escapeHtml(amountFormatted)}</strong> was due on
      ${escapeHtml(dueOn)} and is now ${escapeHtml(overdueText)}. You can
      pay it online with the link below.</p>
      <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">View &amp; pay invoice</a></p>
      <p style="color:#6b7280;font-size:13px;">If you've already paid,
      please disregard this reminder — it can take a few minutes for a
      payment to be confirmed.</p>
    `,
    text: `Hi ${firstName}, invoice ${invoiceNumber} (${installmentLabel}) from ${firmName} for ${amountFormatted} was due on ${dueOn} and is ${overdueText}. Pay it here: ${url}`,
  });
}

/** Pure template so the durable delivery receipt can freeze the retry payload. */
export function taskNoticeEmail(to:string,title:string,body:string,url:string) {
  return {to,subject:title,html:`<h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(url)}">Open task</a></p>`,text:`${title}\n\n${body}\n\nOpen task: ${url}`};
}

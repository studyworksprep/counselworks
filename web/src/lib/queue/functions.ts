import { inngest } from "./inngest";
import {
  sendEmail,
  sendInvitationEmail,
  sendDeadlineReminderEmail,
} from "@/lib/email";

// ── Generic email send ──────────────────────────────────────────────
export const sendEmailJob = inngest.createFunction(
  { id: "send-email", retries: 3 },
  { event: "email/send" },
  async ({ event }) => {
    const { to, subject, html, text, replyTo } = event.data;
    await sendEmail({ to, subject, html, text, replyTo });
  }
);

// ── Invitation email ────────────────────────────────────────────────
export const sendInvitationEmailJob = inngest.createFunction(
  { id: "send-invitation-email", retries: 3 },
  { event: "email/send-invitation" },
  async ({ event }) => {
    const { email, firmName, inviterName, inviteUrl } = event.data;
    await sendInvitationEmail(email, firmName, inviterName, inviteUrl);
  }
);

// ── Deadline reminder email ─────────────────────────────────────────
export const sendDeadlineReminderEmailJob = inngest.createFunction(
  { id: "send-deadline-reminder-email", retries: 3 },
  { event: "email/send-deadline-reminder" },
  async ({ event }) => {
    const { email, studentName, deadlines } = event.data;
    await sendDeadlineReminderEmail(email, studentName, deadlines);
  }
);

// ── Daily digest (scheduled) ────────────────────────────────────────
export const sendDailyDigestJob = inngest.createFunction(
  { id: "send-daily-digest", retries: 3 },
  { event: "email/send-daily-digest" },
  async ({ event }) => {
    const { to, subject, html } = event.data;
    await sendEmail({ to, subject, html });
  }
);

// ── Document processing ─────────────────────────────────────────────
export const processDocumentJob = inngest.createFunction(
  { id: "process-document", retries: 2 },
  { event: "document/process" },
  async ({ event }) => {
    // TODO: Implement document processing logic
    console.log("Processing document:", event.data);
  }
);

// ── Report refresh ──────────────────────────────────────────────────
export const refreshReportsJob = inngest.createFunction(
  { id: "refresh-reports", retries: 2 },
  { event: "reports/refresh" },
  async ({ event }) => {
    // TODO: Implement report refresh logic
    console.log("Refreshing reports:", event.data);
  }
);

// All functions to register with the Inngest serve handler
export const allFunctions = [
  sendEmailJob,
  sendInvitationEmailJob,
  sendDeadlineReminderEmailJob,
  sendDailyDigestJob,
  processDocumentJob,
  refreshReportsJob,
];

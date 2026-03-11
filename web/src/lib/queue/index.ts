import { inngest } from "./inngest";

export { inngest } from "./inngest";

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  firmId: string;
  scheduledAt?: Date;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

// Maps legacy JOB_TYPES to Inngest event names
const JOB_TYPE_TO_EVENT: Record<string, string> = {
  send_reminder_email: "email/send",
  send_daily_digest: "email/send-daily-digest",
  send_deadline_notification: "email/send-deadline-reminder",
  send_new_message_notification: "email/send",
  process_document: "document/process",
  refresh_reports: "reports/refresh",
  execute_automation_rule: "reports/refresh", // placeholder
};

export async function enqueueJob<T extends Record<string, unknown>>(
  type: string,
  payload: T,
  firmId: string,
  options?: { scheduledAt?: Date; maxAttempts?: number }
): Promise<string> {
  const eventName = JOB_TYPE_TO_EVENT[type] ?? type;

  const ids = await inngest.send({
    name: eventName,
    data: { ...payload, firmId },
    ...(options?.scheduledAt && { ts: options.scheduledAt.getTime() }),
  });

  const eventId = ids.ids[0];
  return eventId;
}

// Job types for the platform
export const JOB_TYPES = {
  SEND_REMINDER_EMAIL: "send_reminder_email",
  SEND_DAILY_DIGEST: "send_daily_digest",
  SEND_DEADLINE_NOTIFICATION: "send_deadline_notification",
  SEND_NEW_MESSAGE_NOTIFICATION: "send_new_message_notification",
  PROCESS_DOCUMENT: "process_document",
  REFRESH_REPORTS: "refresh_reports",
  EXECUTE_AUTOMATION_RULE: "execute_automation_rule",
} as const;

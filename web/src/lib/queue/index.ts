// Background job queue abstraction
// Can be backed by database-based queue, BullMQ, or Inngest

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

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler<T>(type: string, handler: JobHandler<T>) {
  handlers.set(type, handler as JobHandler);
}

export async function enqueueJob<T>(
  type: string,
  payload: T,
  firmId: string,
  options?: { scheduledAt?: Date; maxAttempts?: number }
): Promise<string> {
  const jobId = crypto.randomUUID();

  // TODO: Persist to job queue table
  console.log("Job enqueued:", { id: jobId, type, firmId });

  return jobId;
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

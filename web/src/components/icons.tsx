import type { ReactNode } from "react";

/**
 * The CounselWorks icon set (fix plan 9.6, extended by the design refresh).
 *
 * Every glyph sits on one 24px grid with a 1.5 stroke and round caps and
 * joins, drawn in currentColor, so icons from different families line up
 * side by side. Icons are decorative (aria-hidden): the control around them
 * always carries a visible label or an aria-label.
 *
 * Three families, wired up by name in components/ui/icon.tsx:
 *   - Areas: one glyph per part of the app. The sidebar, the page header
 *     and any button or link that goes to that area use the same glyph.
 *   - Actions: one glyph per verb (add, edit, upload, send...).
 *   - Stages: the application pipeline, from a dashed "not started" ring
 *     to the opened decision envelope.
 *
 * No "use client": the icons are plain SVG and render on the server too.
 */

type IconProps = { className?: string };

function Svg({
  className,
  strokeWidth = 1.5,
  children,
}: IconProps & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Areas                                                                    */
/* ------------------------------------------------------------------------ */

export function ApplicationsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </Svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </Svg>
  );
}

/** Calendar with a plus: booking or scheduling a meeting. */
export function CalendarPlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.75 3v2.25M17.25 3v2.25" />
      <path d="M5.25 5.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25Z" />
      <path d="M3 9.75h18" />
      <path d="M12 12.75v4.5M9.75 15h4.5" />
    </Svg>
  );
}

/** A stack of folders: a counselor's caseload. */
export function CaseloadIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7.5 3.75h9" />
      <path d="M5.25 7.125h13.5" />
      <path d="M5.25 10.5h13.5a2.25 2.25 0 0 1 2.25 2.25v6A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75v-6a2.25 2.25 0 0 1 2.25-2.25Z" />
      <path d="M9.75 14.25h4.5" />
    </Svg>
  );
}

export function CollegeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
    </Svg>
  );
}

/** A page under a magnifying glass: reviewing catalog data. */
export function CatalogReviewIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M19.5 10.5V7.81a1.5 1.5 0 0 0-.44-1.06l-3.31-3.31A1.5 1.5 0 0 0 14.69 3H6.75A2.25 2.25 0 0 0 4.5 5.25v13.5A2.25 2.25 0 0 0 6.75 21h4.5" />
      <path d="M8.25 8.25h6M8.25 11.25h3" />
      <path d="M16.5 19.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="m21 21-2.38-2.38" />
    </Svg>
  );
}

/** A card: billing and agreements. */
export function BillingIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 5.25h15a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25v-9A2.25 2.25 0 0 1 4.5 5.25Z" />
      <path d="M2.25 9.75h19.5" />
      <path d="M5.25 15h3M11.25 15h1.5" />
    </Svg>
  );
}

export function DashboardIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </Svg>
  );
}

export function DocumentsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </Svg>
  );
}

export function EssaysIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </Svg>
  );
}

/** A light bulb: planning essay angles. */
export function EssayPlanningIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.75 18h4.5M10.5 21h3" />
      <path d="M12 3a6 6 0 0 0-3.62 10.79c.53.4.87 1 .87 1.66V15.75h5.5v-.3c0-.66.34-1.26.87-1.66A6 6 0 0 0 12 3Z" />
      <path d="M12 12v3.75" />
    </Svg>
  );
}

export function FamiliesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
    </Svg>
  );
}

/** An office building: firm-wide settings. */
export function FirmIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2.25 21h19.5" />
      <path d="M3.75 21V5.25a1.5 1.5 0 0 1 1.5-1.5h7.5a1.5 1.5 0 0 1 1.5 1.5V21" />
      <path d="M14.25 9h4.5a1.5 1.5 0 0 1 1.5 1.5V21" />
      <path d="M7.5 7.5h3M7.5 11.25h3M7.5 15h3M17.25 12.75v.01M17.25 16.5v.01" />
    </Svg>
  );
}

/** A microphone: the interview and story bank. */
export function InterviewIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3a3 3 0 0 1 3 3v5.25a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M5.25 11.25a6.75 6.75 0 0 0 13.5 0" />
      <path d="M12 18v3M9 21h6" />
    </Svg>
  );
}

export function MessagesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </Svg>
  );
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </Svg>
  );
}

export function ProposalsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" />
    </Svg>
  );
}

/** A clipboard with a check: application readiness. */
export function ReadinessIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 4.5h1.5a2.25 2.25 0 0 1 2.25 2.25v12A2.25 2.25 0 0 1 16.5 21h-9a2.25 2.25 0 0 1-2.25-2.25v-12A2.25 2.25 0 0 1 7.5 4.5H9" />
      <path d="M9.75 3h4.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 9 5.25v-1.5A.75.75 0 0 1 9.75 3Z" />
      <path d="m9 13.5 2.25 2.25L15 11.25" />
    </Svg>
  );
}

export function ReportsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </Svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </Svg>
  );
}

export function StudentsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a23.54 23.54 0 0 0-2.688 6.41c3.697-.985 7.56-1.628 11.508-1.875a23.585 23.585 0 0 0 11.507 1.875 23.422 23.422 0 0 0-2.688-6.41M12 2.25l.002.005L12 2.25Zm0 0 7.5 3.75M12 2.25 4.5 6m7.5-3.75v4.5" />
    </Svg>
  );
}

export function TasksIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </Svg>
  );
}

export function WorkflowsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.75 6.75h7.5m-7.5 5.25h7.5m-7.5 5.25h7.5M16.5 6.75l3 3m0 0-3 3m3-3h-6m6 4.5 3 3m0 0-3 3m3-3h-6" />
    </Svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Actions                                                                  */
/* ------------------------------------------------------------------------ */

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={1.75}>
      <path d="M12 4.5v15m7.5-7.5h-15" />
    </Svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
    </Svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.75 6h16.5" />
      <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      <path d="m5.625 6 .9 12.9A2.25 2.25 0 0 0 8.77 21h6.46a2.25 2.25 0 0 0 2.245-2.1l.9-12.9" />
      <path d="M10.125 10.5v6M13.875 10.5v6" />
    </Svg>
  );
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.375 3.75h17.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 7.125v-2.25c0-.621.504-1.125 1.125-1.125Z" />
      <path d="M3.75 8.25v10.5A2.25 2.25 0 0 0 6 21h12a2.25 2.25 0 0 0 2.25-2.25V8.25" />
      <path d="M9.75 12h4.5" />
    </Svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </Svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </Svg>
  );
}

/** A paper airplane: send, submit for review, submitted. */
export function SendIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </Svg>
  );
}

export function EnvelopeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 5.25h15a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25v-9A2.25 2.25 0 0 1 4.5 5.25Z" />
      <path d="m2.625 6.75 9.375 6.5 9.375-6.5" />
    </Svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </Svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </Svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </Svg>
  );
}

export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </Svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.87L19.5 9" />
      <path d="M19.5 4.5V9H15" />
      <path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.87L4.5 15" />
      <path d="M4.5 19.5V15H9" />
    </Svg>
  );
}

export function UndoIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
    </Svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </Svg>
  );
}

export function FilterIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.75 4.5h16.5l-6.375 7.5v5.25l-3.75 2.25V12L3.75 4.5Z" />
    </Svg>
  );
}

/** Three sliders: choosing columns or display options. */
export function AdjustIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 6h9M18 6h1.5M4.5 12h3M12 12h7.5M4.5 18h9M18 18h1.5" />
      <path d="M15.75 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9.75 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM15.75 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </Svg>
  );
}

export function PrintIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.75 8.25v-4.5h10.5v4.5" />
      <path d="M6.75 17.25h-1.5A2.25 2.25 0 0 1 3 15v-4.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 10.5V15a2.25 2.25 0 0 1-2.25 2.25h-1.5" />
      <path d="M7.5 13.5h9a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 .75-.75Z" />
    </Svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.5 8.25h7.5a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-7.5a2.25 2.25 0 0 1 2.25-2.25Z" />
      <path d="M15.75 8.25V6A2.25 2.25 0 0 0 13.5 3.75H6A2.25 2.25 0 0 0 3.75 6v7.5A2.25 2.25 0 0 0 6 15.75h2.25" />
    </Svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.5 13.5a3.75 3.75 0 0 0 5.3 0l3-3a3.75 3.75 0 0 0-5.3-5.3l-1.125 1.125" />
      <path d="M13.5 10.5a3.75 3.75 0 0 0-5.3 0l-3 3a3.75 3.75 0 0 0 5.3 5.3l1.125-1.125" />
    </Svg>
  );
}

export function UserPlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.75 12a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
      <path d="M3 20.25a6.75 6.75 0 0 1 13.5 0" />
      <path d="M19.5 8.25v6M16.5 11.25h6" />
    </Svg>
  );
}

/** A pen on a signature line. */
export function SignIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 20.25h18" />
      <path d="m15.75 3.75 3 3L9 16.5l-3.75.75.75-3.75 9.75-9.75Z" />
    </Svg>
  );
}

/** Two sparkles: AI assistance. */
export function SparklesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.75 4.5Q10.5 10.5 16.5 11.25 10.5 12 9.75 18 9 12 3 11.25 9 10.5 9.75 4.5Z" />
      <path d="M18 2.25v4.5M15.75 4.5h4.5" />
      <path d="M18 16.5v3M16.5 18h3" />
    </Svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 7.5V12l3 2.25" />
    </Svg>
  );
}

export function XCircleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5" />
    </Svg>
  );
}

/** A check inside a seal: approve or sign off. */
export function ApproveIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 2.25 14.1 4l2.72-.27.85 2.6 2.4 1.32-.6 2.67L20.7 12.6l-1.98 1.88.15 2.73-2.62.77-1.41 2.34L12 19.4l-2.84.92-1.41-2.34-2.62-.77.15-2.73L3.3 12.6l1.23-2.28-.6-2.67 2.4-1.32.85-2.6L9.9 4 12 2.25Z" />
      <path d="m9 11.75 2.1 2.1L15 9.9" />
    </Svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Application stages                                                       */
/* ------------------------------------------------------------------------ */

/** A dashed ring: nothing started yet. */
export function StageNotStartedIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.25" strokeDasharray="3.24 3.24" />
    </Svg>
  );
}

/** A half-filled ring: work under way. */
export function StageInProgressIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5a4.5 4.5 0 0 1 0 9V7.5Z" fill="currentColor" />
    </Svg>
  );
}

/** An hourglass: waiting on the college. */
export function StageUnderReviewIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.75 3h10.5M6.75 21h10.5" />
      <path d="M8.25 3v2.38a3.75 3.75 0 0 0 1.1 2.65L12 10.69l2.65-2.66a3.75 3.75 0 0 0 1.1-2.65V3" />
      <path d="M8.25 21v-2.38a3.75 3.75 0 0 1 1.1-2.65L12 13.31l2.65 2.66a3.75 3.75 0 0 1 1.1 2.65V21" />
    </Svg>
  );
}

/** An opened envelope: the decision arrived. */
export function StageDecisionIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21.75 9.75v8.25A2.25 2.25 0 0 1 19.5 20.25h-15A2.25 2.25 0 0 1 2.25 18V9.75" />
      <path d="M2.25 9.75 10.73 3.9a2.25 2.25 0 0 1 2.54 0l8.48 5.85" />
      <path d="m2.25 9.75 9.75 6 9.75-6" />
    </Svg>
  );
}

/** A struck-through ring: withdrawn from the pipeline. */
export function StageWithdrawnIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z" />
      <path d="m6.17 6.17 11.66 11.66" />
    </Svg>
  );
}

/*
 * Small UI glyphs (design refresh, phase 1) — they replace text characters
 * (check marks, crosses, warning signs, angle quotes) that rendered at font
 * size and read poorly to screen readers. Heavier stroke: they are drawn
 * small. Callers label the surrounding control.
 */

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="m4.5 12.75 6 6 9-13.5" />
    </Svg>
  );
}

/** Three dots: "More" — the rest of a shell's navigation (phone tab bar). */
export function EllipsisIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={2.25}>
      <path d="M6.75 12h.01M12 12h.01M17.25 12h.01" />
    </Svg>
  );
}

export function XMarkIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M6 18 18 6M6 6l12 12" />
    </Svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="M15.75 19.5 8.25 12l7.5-7.5" />
    </Svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={2}>
      <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </Svg>
  );
}

export function ExclamationTriangleIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={1.75}>
      <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </Svg>
  );
}

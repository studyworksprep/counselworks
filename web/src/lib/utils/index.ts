import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isPast } from "date-fns";

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string or Date object into a human-readable date.
 * Example: "Jan 15, 2026"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

/**
 * Format a date string or Date object into a human-readable date and time.
 * Example: "Jan 15, 2026, 3:30 PM"
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy, h:mm a");
}

/**
 * Generate a URL-safe slug from a name.
 * Example: "My Firm Name" -> "my-firm-name"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Truncate a string to the specified length with an ellipsis.
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length).trimEnd() + "...";
}

/**
 * Get initials from a first and last name.
 * Example: ("John", "Doe") -> "JD"
 */
export function getInitials(firstName: string, lastName: string): string {
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName.charAt(0).toUpperCase();
  return `${first}${last}`;
}

/**
 * Check whether a due date (ISO string) is in the past.
 */
export function isOverdue(dueDate: string): boolean {
  return isPast(parseISO(dueDate));
}

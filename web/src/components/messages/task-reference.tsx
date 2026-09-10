import Link from "next/link";

/** Only recognize the canonical local task route, never arbitrary message URLs.
 * The destination independently authorizes its task; titles remain plain text. */
export function TaskReference({ body }: { body: string }) {
  const path = body.match(/^Task: (\/task\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/mi)?.[1];
  if (!path) return null;
  return <Link className="mb-2 inline-block text-sm underline" href={path}>Open referenced task</Link>;
}
export function MessageBody({ body }: { body: string }) {
  return <div><TaskReference body={body} /><p className="whitespace-pre-wrap">{body.replace(/^Task: \/task\/[0-9a-f-]{36}\n?/mi, "")}</p></div>;
}

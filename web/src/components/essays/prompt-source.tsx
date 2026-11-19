import { ArrowLink } from "@/components/ui/arrow-link";
import { z } from "zod";

const snapshotSchema = z.object({
  entry_year: z.number().int(), source_url: z.url().refine(url => url.startsWith("https://")),
  verified_on: z.string().nullable(), requirement: z.enum(["required", "optional", "conditional"]),
  text_kind: z.enum(["summary", "verbatim"]), word_limit: z.number().nullable(), character_limit: z.number().nullable(),
});

/** Display the source captured when this assignment was created, even after a
 * later catalog update. A draft's text and source history stay together. */
export function EssayPromptSource({ snapshot }: { snapshot: unknown }) {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  const source = parsed.data;
  return <aside aria-label="Prompt source" className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
    <p>Fall {source.entry_year} · {source.requirement} · {source.text_kind === "summary" ? "Prompt summary — check official wording" : "Official prompt wording"}</p>
    <p className="mt-1"><ArrowLink external href={source.source_url}>Official admissions source</ArrowLink>{source.verified_on && ` · Checked ${source.verified_on}`}</p>
    {source.character_limit && <p className="mt-1">Maximum {source.character_limit} characters.</p>}
  </aside>;
}

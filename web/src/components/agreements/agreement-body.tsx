import {
  parseAgreementMarkdown,
  type Inline,
} from "@/lib/agreements/markdown";

function InlineRun({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((i, idx) =>
        i.type === "bold" ? (
          <strong key={idx} className="font-semibold text-gray-900">
            {i.text}
          </strong>
        ) : i.type === "italic" ? (
          <em key={idx}>{i.text}</em>
        ) : (
          <span key={idx}>{i.text}</span>
        )
      )}
    </>
  );
}

/**
 * Renders an agreement's immutable text (light markdown subset — see
 * src/lib/agreements/markdown.ts) for the signing page, the portal, and
 * staff previews. Presentation only: the hashed snapshot is the source.
 * Everything is emitted as React text nodes, never raw HTML.
 */
export function AgreementBody({ source }: { source: string }) {
  const blocks = parseAgreementMarkdown(source);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-800">
      {blocks.map((b, idx) => {
        switch (b.type) {
          case "heading": {
            const cls =
              b.level === 1
                ? "text-lg font-semibold text-gray-900 pt-2"
                : b.level === 2
                  ? "text-base font-semibold text-gray-900 pt-1"
                  : "text-sm font-semibold text-gray-900";
            return b.level === 1 ? (
              <h2 key={idx} className={cls}>
                <InlineRun inlines={b.inlines} />
              </h2>
            ) : b.level === 2 ? (
              <h3 key={idx} className={cls}>
                <InlineRun inlines={b.inlines} />
              </h3>
            ) : (
              <h4 key={idx} className={cls}>
                <InlineRun inlines={b.inlines} />
              </h4>
            );
          }
          case "hr":
            return <hr key={idx} className="border-gray-200" />;
          case "bullets":
            return (
              <ul key={idx} className="list-disc space-y-1 pl-6">
                {b.items.map((item, i) => (
                  <li key={i}>
                    <InlineRun inlines={item} />
                  </li>
                ))}
              </ul>
            );
          case "ordered":
            return (
              <ol key={idx} className="list-decimal space-y-1 pl-6">
                {b.items.map((item, i) => (
                  <li key={i}>
                    <InlineRun inlines={item} />
                  </li>
                ))}
              </ol>
            );
          case "paragraph":
            return (
              <p key={idx}>
                {b.lines.map((line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    <InlineRun inlines={line} />
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import { MAX_PROPOSAL_FEEDBACK_LENGTH } from "@/lib/constants/proposals";

type ResponseAction = (formData: FormData) => Promise<{ error: string } | { success: true }>;

/** Both actions are bound to the token and fingerprint of the terms on screen. */
export function ProposalApproveForm({ approve, reject, firmName, parentFirstName }: {
  approve: ResponseAction;
  reject: ResponseAction;
  firmName: string;
  parentFirstName: string;
}) {
  const commitWrite = useWriteRefresh();
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await (mode === "approve" ? approve : reject)(formData);
        if ("error" in result) setError(result.error);
        else setSaved(true);
        // Also refresh refusals so a stale page displays current terms/status.
        commitWrite();
      } catch {
        setError("We couldn't save your response. Please try again.");
      }
    });
  }

  return (
    <section aria-label="Your response" className="overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-sm">
      <div className="h-1 bg-primary-900" />
      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-2 md:gap-10">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">The next step</p>
          <h2 className="font-serif text-2xl leading-snug text-primary-900">{mode === "approve" ? `Ready to move forward, ${parentFirstName}?` : "Let's make sure it's right for you."}</h2>
          <p className="mt-3 text-sm leading-7 text-gray-600">{mode === "approve" ? `Let ${firmName} know you'd like to move forward so they can prepare a separate service agreement for your review.` : "Share the problem you see or the changes you'd like. Your counselor will receive your feedback and can prepare a revised proposal."}</p>
          {mode === "approve" && <p className="mt-4 rounded-lg bg-primary-50 p-4 text-sm font-semibold leading-relaxed text-primary-900">This step does not sign a contract. You&apos;ll review and sign the service agreement separately.</p>}
        </div>
        {saved ? (
          <div role="status" className="self-center rounded-xl bg-primary-50 p-5 text-sm text-primary-900">{mode === "approve" ? "Thank you — your go-ahead has been saved. No contract has been signed. Your service agreement comes next." : "Proposal rejected. Your feedback has been saved for your counselor."}</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <Alert className="mb-4">{error}</Alert>}
            <fieldset key={mode} disabled={isPending} className="space-y-4">
              {mode === "approve" ? (
                <>
                  <Input id="approved_by_name" name="approved_by_name" label="Your name" required maxLength={120} autoComplete="name" placeholder="e.g. Alex Rivera" aria-describedby="approval-name-note" />
                  <p id="approval-name-note" className="text-xs text-gray-600">For our records — this is not a signature.</p>
                  <label className="flex items-start gap-3 text-sm leading-relaxed text-gray-700">
                    <input type="checkbox" name="confirm" required className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300" />
                    I&apos;d like to move forward and receive a separate service agreement to review. I understand I am not signing a contract here.
                  </label>
                  <Button type="submit" loading={isPending} className="w-full py-3">Request service agreement</Button>
                  <Button type="button" variant="outline" className="w-full" onClick={() => { setMode("reject"); setError(null); }}>Reject / request changes</Button>
                </>
              ) : (
                <>
                  <Textarea id="rejection_comment" name="rejection_comment" label="Feedback / requested changes" required maxLength={MAX_PROPOSAL_FEEDBACK_LENGTH} value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5} autoFocus aria-describedby="feedback-help" placeholder="For example: Could we adjust the services included or the payment schedule?" />
                  <p id="feedback-help" className="text-xs leading-relaxed text-gray-500">Rejecting closes this version for approval. Your counselor can send a revised proposal.</p>
                  <Button type="submit" variant="danger" loading={isPending} className="w-full bg-danger-700 py-3 hover:bg-danger-800">Reject proposal</Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => { setMode("approve"); setError(null); }}>Back to approval</Button>
                </>
              )}
            </fieldset>
          </form>
        )}
      </div>
    </section>
  );
}

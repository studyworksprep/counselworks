/** The same approval/signing distinction appears in the staff preview and client document. */
export function ProposalNextSteps() {
  return (
    <section aria-label="How proposal approval works" className="rounded-2xl border border-[#e8dfc8] bg-[#fbf8f0] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#755300]">A proposal for your consideration</p>
      <h2 className="mt-2 text-xl font-semibold leading-snug text-primary-900 sm:text-2xl">Approving this proposal is not signing a contract.</h2>
      <p className="mt-3 text-sm leading-7 text-gray-700">Your approval lets us know you&apos;d like to move forward. We&apos;ll then prepare a separate service agreement for you to review and decide whether to sign.</p>
      <ol className="mt-5 grid gap-4 border-t border-[#e8dfc8] pt-5 text-sm sm:grid-cols-3">
        <li><p className="font-semibold text-primary-900">1. Review the proposal</p><p className="mt-1 leading-relaxed text-gray-600">Explore the plan, services, and proposed fees.</p></li>
        <li><p className="font-semibold text-primary-900">2. Give us your go-ahead</p><p className="mt-1 leading-relaxed text-gray-600">Ask us to prepare your service agreement.</p></li>
        <li><p className="font-semibold text-primary-900">3. Review &amp; sign separately</p><p className="mt-1 leading-relaxed text-gray-600">Review the agreement before deciding to sign. Services begin after that step.</p></li>
      </ol>
    </section>
  );
}

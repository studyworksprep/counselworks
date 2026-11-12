"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { useUnsavedChangesWarning } from "@/lib/hooks/use-unsaved-changes-warning";
import { cn } from "@/lib/utils";
import {
  formatCents,
  parseDollarsToCents,
  type InstallmentLine,
} from "@/lib/agreements/schedule";
import { PAYMENT_STRUCTURES, type PaymentStructure } from "@/lib/constants/proposals";
import { saveProposal } from "@/lib/actions/proposals";
import { validateProposalInput } from "@/lib/proposals/input";
import {
  applyDiscount,
  discountPercentFor,
  formatPercent,
  parsePercent,
} from "@/lib/proposals/pricing";
import {
  MAX_CUSTOM_LINES,
  buildProposalSchedule,
} from "@/lib/proposals/schedule";
import { formatLongDate } from "@/lib/proposals/terms";
import {
  centsToInput,
  effectiveBalanceDueOn,
  effectiveDiscountedCents,
  effectiveTerms,
  proposalInputFromForm,
  scheduleFieldsFromForm,
  type CustomLineValues,
  type ProposalFormValues,
} from "@/lib/proposals/form";

/** The live schedule: built, not buildable yet (why), or waiting on a price. */
type SchedulePreview =
  | { kind: "lines"; lines: InstallmentLine[] }
  | { kind: "problem"; text: string }
  | { kind: "hint"; text: string };

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/**
 * The proposal builder, shared by New and Edit. All state is the strings a
 * counselor types (`ProposalFormValues`); the live summary and the save
 * payload are derived through the same pure builders the server re-runs,
 * so the schedule previewed here is the schedule that gets stored.
 */
export function ProposalForm({
  mode,
  proposalId,
  initialValues,
  todayIso,
  graduationYears,
  alreadySent = false,
}: {
  mode: "create" | "edit";
  /** Edit mode: the proposal being changed. */
  proposalId?: string;
  initialValues: ProposalFormValues;
  /** Firm-local calendar date (validation and defaults agree with the server). */
  todayIso: string;
  graduationYears: number[];
  /** Edit mode: the client already has the link and will see the changes. */
  alreadySent?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProposalFormValues>(initialValues);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nextLineKey = useRef(initialValues.customLines.length);
  useUnsavedChangesWarning(dirty);

  function patch(update: Partial<ProposalFormValues>) {
    setValues((current) => ({ ...current, ...update }));
    setDirty(true);
  }

  // --- Pricing: type the percent OR the discounted cost; the other follows.
  function handleTotalChange(totalCost: string) {
    const total = parseDollarsToCents(totalCost.trim());
    const percent = parsePercent(values.discountPercent);
    patch({
      totalCost,
      discountedCost:
        total !== null && total > 0 && percent !== null
          ? centsToInput(applyDiscount(total, percent))
          : values.discountedCost,
    });
  }
  function handlePercentChange(discountPercent: string) {
    const total = parseDollarsToCents(values.totalCost.trim());
    const percent = parsePercent(discountPercent);
    patch({
      discountPercent,
      discountedCost:
        total !== null && total > 0 && percent !== null
          ? centsToInput(applyDiscount(total, percent))
          : values.discountedCost,
    });
  }
  function handleDiscountedChange(discountedCost: string) {
    const total = parseDollarsToCents(values.totalCost.trim());
    const discounted = parseDollarsToCents(discountedCost.trim());
    const derivable =
      total !== null && total > 0 && discounted !== null && discounted > 0 && discounted <= total;
    patch({
      discountedCost,
      discountPercent: derivable
        ? discounted === total
          ? ""
          : String(discountPercentFor(total, discounted))
        : values.discountPercent,
    });
  }

  // --- Custom schedule rows.
  function patchLine(key: string, update: Partial<CustomLineValues>) {
    patch({
      customLines: values.customLines.map((line) =>
        line.key === key ? { ...line, ...update } : line
      ),
    });
  }
  function addLine() {
    patch({
      customLines: [
        ...values.customLines,
        {
          key: `line-${nextLineKey.current++}`,
          label: "",
          amount: "",
          atSigning: false,
          dueOn: "",
        },
      ],
    });
  }
  function removeLine(key: string) {
    patch({ customLines: values.customLines.filter((line) => line.key !== key) });
  }

  const totalCents = parseDollarsToCents(values.totalCost.trim());
  const discountedCents = effectiveDiscountedCents(values);
  const balanceDueOn = effectiveBalanceDueOn(values, todayIso);
  const termsText = effectiveTerms(values);
  const structure = values.paymentStructure;
  const usesDeposit = structure === "deposit_monthly" || structure === "deposit_quarterly";

  // The schedule exactly as it would be saved, or why it can't be built yet.
  const schedule = useMemo((): SchedulePreview => {
    if (discountedCents === null || discountedCents <= 0) {
      return { kind: "hint", text: "Enter the cost to see the payment schedule." };
    }
    const fields = scheduleFieldsFromForm(values, todayIso);
    if (!fields.ok) return { kind: "problem", text: fields.error };
    const built = buildProposalSchedule({
      structure: values.paymentStructure,
      totalCents: discountedCents,
      ...fields.fields,
    });
    return built.ok
      ? { kind: "lines", lines: built.lines }
      : { kind: "problem", text: built.error };
  }, [values, todayIso, discountedCents]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const converted = proposalInputFromForm(values, todayIso);
    if (!converted.ok) return setError(converted.error);
    // Same validation the server runs — caught here first so the counselor
    // gets the answer without a round trip.
    const validated = validateProposalInput(converted.input, todayIso);
    if (!validated.ok) return setError(validated.error);

    startTransition(async () => {
      const result = await saveProposal(converted.input, proposalId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDirty(false);
      router.push(`/proposals/${result.id}`);
    });
  }

  const cancelHref = proposalId ? `/proposals/${proposalId}` : "/proposals";

  return (
    <PageShell
      title={mode === "create" ? "New proposal" : "Edit proposal"}
      description={
        mode === "create"
          ? "Write an offer for a prospective family. You'll preview it before anything is sent."
          : "Changes are saved to this proposal."
      }
    >
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      >
        <div className="space-y-6 lg:col-span-2">
          {alreadySent && (
            <Alert variant="warning">
              This proposal is already with the client. They will see your
              changes the next time they open their link — and can only
              approve the version on their screen.
            </Alert>
          )}

          <SectionCard
            title="Client"
            hint="Who the proposal is for. No family record is needed yet."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="parent_first_name"
                name="parent_first_name"
                label="Parent first name"
                required
                maxLength={80}
                value={values.parentFirstName}
                onChange={(e) => patch({ parentFirstName: e.target.value })}
              />
              <Input
                id="parent_last_name"
                name="parent_last_name"
                label="Parent last name"
                required
                maxLength={80}
                value={values.parentLastName}
                onChange={(e) => patch({ parentLastName: e.target.value })}
              />
            </div>
            <Input
              id="parent_email"
              name="parent_email"
              type="email"
              label="Parent email"
              required
              placeholder="The proposal is emailed here"
              value={values.parentEmail}
              onChange={(e) => patch({ parentEmail: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                id="student_first_name"
                name="student_first_name"
                label="Student first name"
                required
                maxLength={80}
                value={values.studentFirstName}
                onChange={(e) => patch({ studentFirstName: e.target.value })}
              />
              <Input
                id="student_last_name"
                name="student_last_name"
                label="Student last name"
                required
                maxLength={80}
                value={values.studentLastName}
                onChange={(e) => patch({ studentLastName: e.target.value })}
              />
              <Select
                id="graduation_year"
                name="graduation_year"
                label="Graduation year"
                required
                placeholder="Select year"
                value={values.graduationYear}
                onChange={(e) => patch({ graduationYear: e.target.value })}
                options={graduationYears.map((year) => ({
                  value: String(year),
                  label: `Class of ${year}`,
                }))}
              />
            </div>
          </SectionCard>

          <SectionCard title="Proposal">
            <Input
              id="title"
              name="title"
              label="Title"
              required
              maxLength={120}
              value={values.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
            <div>
              <Textarea
                id="intro_message"
                name="intro_message"
                label="Personal note (optional)"
                rows={3}
                maxLength={2000}
                placeholder="A short note to the family — shown at the top of the proposal and in the email."
                value={values.introMessage}
                onChange={(e) => patch({ introMessage: e.target.value })}
              />
            </div>
            <div>
              <Textarea
                id="services_summary"
                name="services_summary"
                label="Services included"
                required
                rows={8}
                maxLength={6000}
                value={values.servicesSummary}
                onChange={(e) => patch({ servicesSummary: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">
                One item per line starting with a dash makes a bulleted list.
                **Double asterisks** make text bold.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Pricing"
            hint="Enter the discount as a percent or type the discounted cost — the other follows."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                id="total_cost"
                name="total_cost"
                label="Total cost (USD)"
                required
                inputMode="decimal"
                placeholder="e.g. 12,000"
                value={values.totalCost}
                onChange={(e) => handleTotalChange(e.target.value)}
              />
              <Input
                id="discount_percent"
                name="discount_percent"
                label="Discount (%)"
                inputMode="decimal"
                placeholder="0"
                value={values.discountPercent}
                onChange={(e) => handlePercentChange(e.target.value)}
              />
              <Input
                id="discounted_cost"
                name="discounted_cost"
                label="Discounted cost (USD)"
                inputMode="decimal"
                placeholder="Same as total"
                value={values.discountedCost}
                onChange={(e) => handleDiscountedChange(e.target.value)}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Payment structure"
            hint="How the discounted cost is paid. The schedule on the right is exactly what the client will see."
          >
            <fieldset className="space-y-2">
              <legend className="sr-only">Payment structure</legend>
              {PAYMENT_STRUCTURES.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3",
                    structure === option.value
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <input
                    type="radio"
                    name="payment_structure"
                    value={option.value}
                    checked={structure === option.value}
                    onChange={() =>
                      patch({ paymentStructure: option.value as PaymentStructure })
                    }
                    className="mt-1 h-4 w-4 border-gray-300"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {option.label}
                    </span>
                    <span className="block text-xs text-gray-600">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {structure === "half_half" && (
              <div className="max-w-xs">
                <Input
                  id="balance_due_on"
                  name="balance_due_on"
                  type="date"
                  label="Second half due no later than"
                  required
                  value={balanceDueOn}
                  onChange={(e) => patch({ balanceDueOn: e.target.value })}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Defaults to January 1 of the student&apos;s senior year. The
                  second-half invoice carries this date; it falls due sooner
                  if the final application goes in first.
                </p>
              </div>
            )}

            {usesDeposit && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  id="deposit_amount"
                  name="deposit_amount"
                  label="Deposit at signing (USD)"
                  required
                  inputMode="decimal"
                  placeholder="e.g. 2,000"
                  value={values.depositAmount}
                  onChange={(e) => patch({ depositAmount: e.target.value })}
                />
                <Input
                  id="installment_count"
                  name="installment_count"
                  type="number"
                  min={1}
                  max={36}
                  label={
                    structure === "deposit_monthly"
                      ? "Monthly payments"
                      : "Quarterly payments"
                  }
                  required
                  value={values.installmentCount}
                  onChange={(e) => patch({ installmentCount: e.target.value })}
                />
                <Input
                  id="first_payment_on"
                  name="first_payment_on"
                  type="date"
                  label="First payment due"
                  required
                  value={values.firstPaymentOn}
                  onChange={(e) => patch({ firstPaymentOn: e.target.value })}
                />
              </div>
            )}

            {structure === "custom" && (
              <div className="space-y-3">
                {values.customLines.map((line, index) => (
                  <div
                    key={line.key}
                    className="rounded-lg border border-gray-200 p-3"
                    data-testid="custom-line"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_11rem]">
                      <Input
                        id={`custom_label_${index}`}
                        label={`Payment ${index + 1}`}
                        maxLength={120}
                        placeholder="What this payment is"
                        value={line.label}
                        onChange={(e) => patchLine(line.key, { label: e.target.value })}
                      />
                      <Input
                        id={`custom_amount_${index}`}
                        label="Amount (USD)"
                        inputMode="decimal"
                        value={line.amount}
                        onChange={(e) => patchLine(line.key, { amount: e.target.value })}
                      />
                      {index === 0 && line.atSigning ? (
                        <div>
                          <p className="mb-1.5 text-sm font-medium text-gray-700">Due</p>
                          <p className="py-2 text-sm text-gray-600">At signing</p>
                        </div>
                      ) : (
                        <Input
                          id={`custom_due_${index}`}
                          type="date"
                          label="Due date"
                          value={line.dueOn}
                          onChange={(e) => patchLine(line.key, { dueOn: e.target.value })}
                        />
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      {index === 0 ? (
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={line.atSigning}
                            onChange={(e) =>
                              patchLine(line.key, { atSigning: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Due when the agreement is signed
                        </label>
                      ) : (
                        <span />
                      )}
                      {values.customLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="text-xs text-gray-500 hover:text-danger-600"
                        >
                          Remove payment {index + 1}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                  disabled={values.customLines.length >= MAX_CUSTOM_LINES}
                >
                  Add payment
                </Button>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Test preparation"
            hint="Optionally include a pack of lessons at no extra charge, and the price of sessions beyond it."
          >
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="checkbox"
                name="include_test_prep"
                checked={values.includeTestPrep}
                onChange={(e) => patch({ includeTestPrep: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              Include test preparation lessons
            </label>
            {values.includeTestPrep && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="test_prep_lessons"
                  name="test_prep_lessons"
                  type="number"
                  min={1}
                  max={500}
                  label="Lessons included"
                  required
                  value={values.testPrepLessons}
                  onChange={(e) => patch({ testPrepLessons: e.target.value })}
                />
                <div>
                  <Input
                    id="additional_session_rate"
                    name="additional_session_rate"
                    label="Each additional session (USD)"
                    inputMode="decimal"
                    placeholder="Optional"
                    value={values.additionalSessionRate}
                    onChange={(e) => patch({ additionalSessionRate: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    What a session costs once the included lessons are used.
                  </p>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Program details (optional)">
            <div>
              <Textarea
                id="terms_and_conditions"
                name="terms_and_conditions"
                label="Program notes and policies"
                rows={14}
                maxLength={12000}
                value={termsText}
                onChange={(e) =>
                  patch({ termsAndConditions: e.target.value, termsCustomized: true })
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                {values.termsCustomized
                  ? "Your program notes. "
                  : "Starter notes — edit them to match your firm's policies and service agreement. "}
                Shown under expandable &ldquo;Program details to review&rdquo; on the proposal. Approval only requests a separate service agreement; it does not sign a contract. Leave blank to omit these notes.
                {values.termsCustomized && mode === "create" && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() =>
                        patch({ termsAndConditions: "", termsCustomized: false })
                      }
                      className="text-primary-700 underline"
                    >
                      Restore the starter notes
                    </button>
                  </>
                )}
              </p>
            </div>
            <div className="max-w-xs">
              <Input
                id="valid_until"
                name="valid_until"
                type="date"
                label="Valid through"
                required
                min={todayIso}
                value={values.validUntil}
                onChange={(e) => patch({ validUntil: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">
                The last day the client can approve from their link.
              </p>
            </div>
          </SectionCard>
        </div>

        <aside className="lg:col-span-1">
          <div className="space-y-4 lg:sticky lg:top-6">
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900">Summary</h2>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <dl className="space-y-1">
                  {totalCents !== null &&
                    discountedCents !== null &&
                    discountedCents < totalCents && (
                      <>
                        <div className="flex justify-between gap-3 text-gray-600">
                          <dt>Program fee</dt>
                          <dd>{formatCents(totalCents)}</dd>
                        </div>
                        <div className="flex justify-between gap-3 text-success-700">
                          <dt>
                            Discount (
                            {formatPercent(parsePercent(values.discountPercent) ?? 0)})
                          </dt>
                          <dd>−{formatCents(totalCents - discountedCents)}</dd>
                        </div>
                      </>
                    )}
                  <div className="flex justify-between gap-3 font-semibold text-gray-900">
                    <dt>Client pays</dt>
                    <dd data-testid="summary-total">
                      {discountedCents !== null && discountedCents > 0
                        ? formatCents(discountedCents)
                        : "—"}
                    </dd>
                  </div>
                </dl>

                <div>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Payment schedule
                  </h3>
                  {schedule.kind === "lines" ? (
                    <ol className="space-y-1.5" data-testid="schedule-preview">
                      {schedule.lines.map((line) => (
                        <li
                          key={line.installmentNumber}
                          className="flex justify-between gap-3 text-gray-700"
                        >
                          <span>
                            {line.label}
                            {line.dueOn && (
                              <span className="block text-xs text-gray-500">
                                Due {formatLongDate(line.dueOn)}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-medium text-gray-900">
                            {formatCents(line.amountCents)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : schedule.kind === "problem" ? (
                    <p className="text-warning-800" data-testid="schedule-problem">
                      {schedule.text}
                    </p>
                  ) : (
                    <p className="text-gray-500">{schedule.text}</p>
                  )}
                </div>

                {values.includeTestPrep && values.testPrepLessons && (
                  <p className="text-gray-700">
                    {values.testPrepLessons} test prep lesson
                    {values.testPrepLessons === "1" ? "" : "s"} included
                  </p>
                )}

                {error && <Alert>{error}</Alert>}

                <div className="flex flex-wrap gap-3 pt-1">
                  <Button type="submit" loading={isPending}>
                    {mode === "create" ? "Save draft and preview" : "Save changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push(cancelHref)}
                  >
                    Cancel
                  </Button>
                </div>
                {mode === "create" && (
                  <p className="text-xs text-gray-500">
                    Nothing is sent yet — you&apos;ll see the proposal exactly
                    as the client will, then choose to email it.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </aside>
      </form>
    </PageShell>
  );
}

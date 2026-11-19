"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveInterviewAnswer } from "@/lib/actions/interview";
import {
  activeQuestions,
  answerStatus,
  defaultAnswerAudience,
  IMPORTANCE_LABELS,
  TOPIC_INTROS,
} from "@/lib/interview/conversation";
import {
  questionFor,
  questionsFor,
  type InterviewAnswer,
  type InterviewQuestion,
  type InterviewWorkspace,
  type StructuredResponse,
} from "@/lib/interview/template";

export function Conversation({
  data,
  stage,
  onStage,
  onDirty,
  targetKey,
  targetRevision,
  onStory,
  aiQuestion,
}: {
  data: InterviewWorkspace;
  stage: number;
  onStage: (stage: number) => void;
  onDirty: (key: string, dirty: boolean) => void;
  targetKey?: string;
  targetRevision?: number;
  aiQuestion?: { key: string; prompt: string };
  onStory: (a: InterviewAnswer) => void;
}) {
  const kind = data.kind === "parent" ? "parent" : "student",
    router = useRouter();
  const [updates, setUpdates] = useState<Record<string, InterviewAnswer>>({});
  const answers = data.answers
    .filter((a) => a.respondent_user_id === data.actorId)
    .map((a) => updates[a.question_key] ?? a);
  for (const a of Object.values(updates))
    if (!answers.some((old) => old.question_key === a.question_key))
      answers.push(a);
  const active = activeQuestions(kind, answers);
  const [current, setCurrent] = useState("");
  const stageQuestions = active.filter((q) => q.stage === stage);
  const archived = questionsFor(kind).find(
    (q) =>
      q.key === current &&
      q.stage === stage &&
      !stageQuestions.some((active) => active.key === q.key) &&
      answers.some((a) => a.question_key === q.key),
  );
  if (archived) stageQuestions.push(archived);
  const [review, setReview] = useState(false),
    [dirty, setDirty] = useState(false),
    [started, setStarted] = useState(false);
  const cursorKey = `cw-interview-v2:${data.actorId}:${data.student.id}`;
  const question =
    stageQuestions.find((q) => q.key === current) ?? stageQuestions[0];
  useEffect(() => {
    let key: string | null = null;
    try {
      key = localStorage.getItem(cursorKey);
    } catch {}
    const saved = active.find((q) => q.key === key);
    const next =
      (targetKey ? active.find((q) => q.key === targetKey) : null) ??
      saved ??
      active.find((q) => !answers.some((a) => a.question_key === q.key)) ??
      active[0];
    const timeout = window.setTimeout(() => {
      if (next) {
        setCurrent(next.key);
        onStage(next.stage);
      }
      setStarted(answers.length > 0 || !!targetKey);
    }, 0);
    return () => window.clearTimeout(timeout);
    // Resume once; later response refreshes must not move a person mid-answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKey]);
  useEffect(() => {
    if (!targetKey) return;
    const timeout = window.setTimeout(() => {
      setCurrent(targetKey);
      const q = questionFor(targetKey, kind);
      if (q) onStage(q.stage);
      setReview(false);
      setStarted(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [targetKey, targetRevision, kind, onStage]);
  useEffect(() => {
    if (current && question && !review) {
      try {
        localStorage.setItem(cursorKey, question.key);
      } catch {}
    }
  }, [cursorKey, current, question, review]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (started) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    }
  }, [question?.key, review, started]);
  function go(q: InterviewQuestion) {
    setCurrent(q.key);
    onStage(q.stage);
    setReview(false);
    setStarted(true);
  }
  const sections = [...new Set(stageQuestions.map((q) => q.section))];
  const category = stageQuestions.filter(
    (q) => q.section === question?.section,
  );
  const categoryIndex = category.findIndex((q) => q.key === question?.key);
  const intro = TOPIC_INTROS[question?.section ?? ""];
  return (
    <div className="space-y-5">
      {!started ? (
        <section className="mx-auto max-w-2xl rounded-2xl border border-primary-100 bg-white p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-700">
            A conversation, at your pace
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            Let’s get to know what matters to you.
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            We’ll take one question at a time. A few choices, a small memory, or
            “I’m still figuring it out” are all useful. No polished writing
            needed.
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            {kind === "student"
              ? "New responses start shared with your parents or guardians and counseling team. Before each answer, you can uncheck parent access. Earlier sharing choices stay as you set them."
              : "Your responses start with you and the counseling team. Choose separately if you want to share an answer with your student and family."}
          </p>
          <Button className="mt-5 min-h-11" onClick={() => setStarted(true)}>
            Let’s begin
          </Button>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {answers.filter((a) => a.state === "answered").length} answered ·{" "}
              {answers.filter((a) => a.state === "deferred").length} to revisit
              · Every question is optional
            </p>
            <Button
              variant="ghost"
              disabled={dirty}
              onClick={() => {
                setReview((v) => !v);
              }}
            >
              {" "}
              {review ? "Return to conversation" : "Review answers and sharing"}
            </Button>
          </div>
          <details className="rounded-xl border border-gray-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Topics in this stage
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {sections.map((section) => (
                <Button
                  key={section}
                  variant="outline"
                  disabled={dirty}
                  onClick={() =>
                    go(stageQuestions.find((q) => q.section === section)!)
                  }
                >
                  {TOPIC_INTROS[section]?.title ?? section}
                </Button>
              ))}
            </div>
            <Select
              id="interview-question-jump"
              label="Go to a question"
              value={question?.key ?? ""}
              disabled={dirty}
              onChange={(e) => {
                const q = questionsFor(kind).find(
                  (q) => q.key === e.target.value,
                );
                if (q) go(q);
              }}
              options={active.map((q) => ({
                value: q.key,
                label: `${q.key} · ${q.text}`,
              }))}
            />
          </details>
          {review ? (
            <section
              aria-labelledby="conversation-review"
              className="space-y-4"
            >
              <h2
                id="conversation-review"
                tabIndex={-1}
                ref={heading}
              className="scroll-mt-20 text-xl font-semibold"
              >
                Your answers and sharing choices
              </h2>
              <p className="text-sm text-gray-600">
                Come back to anything. A discussion request does not change your
                answer or who can see it. Stories, briefs and essays have
                separate sharing controls.
              </p>
              {questionsFor(kind).map((q) => {
                const a = answers.find((a) => a.question_key === q.key);
                if (!a) return null;
                return (
                  <article
                    key={q.key}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <h3 className="text-sm font-medium">{q.text}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {answerStatus(a)} ·{" "}
                      {a.audience === "family"
                        ? "Shared with family"
                        : "You and counseling team"}
                      {a.discussion_requested
                        ? " · Counselor discussion requested"
                        : ""}
                      {!active.some((item) => item.key === q.key)
                        ? " · Earlier follow-up, no longer on your current path"
                        : ""}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm">
                      {a.answer}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => go(q)}
                    >
                      Revisit {q.key}
                    </Button>
                  </article>
                );
              })}
              {!answers.length && (
                <p className="text-sm text-gray-500">
                  Your saved responses will appear here.
                </p>
              )}
            </section>
          ) : (
            question && (
              <section className="mx-auto max-w-3xl space-y-4">
                <div className="rounded-xl bg-primary-50 p-4">
                  <h2
                    tabIndex={-1}
                    ref={heading}
                className="scroll-mt-20 font-semibold text-primary-900"
                  >
                    {intro?.title ?? "Your next thought"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-gray-700">
                    {intro?.intro}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs text-gray-500">
                    Question {categoryIndex + 1} of {category.length} in this
                    topic
                  </p>
                  <progress
                    aria-label="Progress within this topic"
                    value={categoryIndex + 1}
                    max={category.length}
                    className="h-2 w-full accent-primary-600"
                  />
                </div>
                <QuestionEditor
                  aiPrompt={
                    aiQuestion?.key === question.key
                      ? aiQuestion.prompt
                      : undefined
                  }
                  key={`${data.actorId}:${question.key}`}
                  data={data}
                  question={question}
                  answer={answers.find((a) => a.question_key === question.key)}
                  onDirty={(changed) => {
                    setDirty(changed);
                    onDirty(question.key, changed);
                  }}
                  onSaved={(answer, move) => {
                    const nextAnswers = [
                      ...answers.filter(
                        (a) => a.question_key !== answer.question_key,
                      ),
                      answer,
                    ];
                    setUpdates((u) => ({
                      ...u,
                      [answer.question_key]: answer,
                    }));
                    if (move === "exit") {
                      router.push(
                        kind === "student"
                          ? "/student-dashboard"
                          : "/family-dashboard",
                      );
                      return;
                    }
                    if (move === "next") {
                      const path = activeQuestions(kind, nextAnswers);
                      const index = path.findIndex(
                        (q) => q.key === question.key,
                      );
                      const next = path[index + 1];
                      if (next) go(next);
                      else setReview(true);
                    }
                  }}
                  onBack={() => {
                    const index = active.findIndex(
                      (q) => q.key === question.key,
                    );
                    if (index > 0) go(active[index - 1]);
                  }}
                  canBack={active.findIndex((q) => q.key === question.key) > 0}
                  onStory={onStory}
                />
              </section>
            )
          )}
        </>
      )}
    </div>
  );
}

function QuestionEditor({
  data,
  question,
  answer,
  onSaved,
  onDirty,
  onBack,
  canBack,
  onStory,
  aiPrompt,
}: {
  data: InterviewWorkspace;
  question: InterviewQuestion;
  answer?: InterviewAnswer;
  onSaved: (a: InterviewAnswer, move: "stay" | "next" | "exit") => void;
  onDirty: (v: boolean) => void;
  onBack: () => void;
  canBack: boolean;
  onStory: (a: InterviewAnswer) => void;
  aiPrompt?: string;
}) {
  const id = useId(),
    legacy = !!answer && answer.template_version !== 2;
  const [convert, setConvert] = useState(false),
    [revision, setRevision] = useState(answer?.revision ?? 0),
    [savedAnswer, setSavedAnswer] = useState(answer);
  const [options, setOptions] = useState(
    answer?.structured_response?.optionIds ?? [],
  );
  const known =
    question.key === "A1"
      ? `${data.student.name}, Class of ${data.student.graduationYear}`
      : question.key === "A2"
        ? (data.student.school ?? "School not set")
        : "";
  const [text, setText] = useState(
    answer?.structured_response?.text ??
      (legacy || question.format === "text" ? (answer?.answer ?? "") : ""),
  );
  const [importance, setImportance] = useState<
    StructuredResponse["importance"]
  >(answer?.structured_response?.importance ?? "preference");
  const [state, setState] = useState(answer?.state ?? "answered"),
    [audience, setAudience] = useState(
      defaultAnswerAudience(
        data.kind === "parent" ? "parent" : "student",
        answer,
      ),
    ),
    [discussion, setDiscussion] = useState(
      answer?.discussion_requested ?? false,
    );
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, start] = useTransition();
  function changed() {
    setDirty(true);
    setNotice("");
    onDirty(true);
  }
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function choose(option: string) {
    changed();
    setState(option === "undecided" ? "unsure" : "answered");
    setOptions((old) => {
      if (question.format === "single" || question.format === "confirm")
        return [option];
      if (["flexible", "undecided"].includes(option)) return [option];
      const next = old.filter((id) => !["flexible", "undecided"].includes(id));
      return next.includes(option)
        ? next.filter((id) => id !== option)
        : [...next, option];
    });
  }
  function save(move: "stay" | "next" | "exit", override?: string) {
    setError("");
    setDirty(true);
    onDirty(true);
    const form = new FormData();
    const keepLegacy = legacy && !convert;
    const payload: StructuredResponse = {
      version: 2,
      optionIds: override === "declined" ? [] : options.filter(Boolean),
      text:
        override === "declined"
          ? ""
          : question.format === "confirm" && options.includes("confirm")
            ? known
            : text,
      importance,
    };
    form.set("student_id", data.student.id);
    form.set("question_key", question.key);
    form.set("revision", String(revision));
    form.set("respondent_kind", data.kind);
    form.set("template_version", keepLegacy ? "1" : "2");
    form.set("state", override ?? state);
    form.set("audience", audience);
    if (audience === "family") form.set("share_with_family", "yes");
    if (discussion) form.set("discussion_requested", "yes");
    form.set("structured_response", JSON.stringify(payload));
    form.set("answer", keepLegacy ? text : "");
    if (convert) form.set("confirm_conversion", "yes");
    if (keepLegacy && question.key === "P1")
      text
        .split("\n")
        .slice(0, 3)
        .forEach((p, i) => form.set(`priority_${i + 1}`, p));
    start(async () => {
      try {
        const result = await saveInterviewAnswer(form);
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
        if ("answer" in result && result.answer) {
          const a = result.answer as InterviewAnswer;
          setRevision(a.revision);
          setSavedAnswer(a);
          setDirty(false);
          setNotice("Saved");
          onDirty(false);
          onSaved(a, move);
        }
      } catch {
        setError("Unable to save. Your response is still here. Try again.");
      }
    });
  }
  return (
    <form
      data-question={question.key}
      id={
        savedAnswer
          ? `interview-answer-${savedAnswer.id}`
          : `interview-question-${question.key}`
      }
      tabIndex={-1}
      className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7"
      onSubmit={(e) => {
        e.preventDefault();
        save("next");
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <legend className="sr-only">{question.text}</legend>
        <p className="text-xs font-medium text-primary-700">{question.key}</p>
        <h3 className="text-xl font-semibold leading-8">{question.text}</h3>
        <p
          id={`${id}-audience-note`}
          className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700"
        >
          {audience === "family"
            ? data.kind === "student"
              ? "Your parents or guardians and counseling team can see this response."
              : "Your student, family and counseling team can see this response."
            : "Only you and your counseling team can see this response."}
        </p>
        {aiPrompt &&
          !["skip", "discuss", "declined", "deferred"].includes(state) && (
            <p className="rounded-lg bg-primary-50 p-3 text-sm">
              AI question to explore: {aiPrompt} Write your own response if it
              helps.
            </p>
          )}
        {legacy && !convert ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              Earlier prompt:{" "}
              {
                questionFor(
                  question.key,
                  data.kind === "parent" ? "parent" : "student",
                  1,
                )?.text
              }
            </p>
            <p className="text-sm text-gray-600">
              This is your earlier response. Its sharing and context choices are
              preserved. We have not guessed choices from your writing.
            </p>
            <Textarea
              id={`${id}-legacy`}
              name="answer"
              label="Your response"
              value={text || answer?.answer || ""}
              onChange={(e) => {
                setText(e.target.value);
                changed();
              }}
              maxLength={12000}
            />
            <p className="text-xs text-gray-500">
              Earlier status: {answerStatus(answer)}
            </p>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setConvert(true);
                setText(answer?.answer ?? "");
                setState("answered");
                changed();
              }}
            >
              Review and use the new format
            </Button>
          </div>
        ) : (
          <>
            {known && (
              <p className="rounded-lg border border-gray-200 p-3 text-sm">
                Already in your profile: <strong>{known}</strong>. Confirming
                adds this to your interview with the audience shown above.
                Profile changes still happen in your profile.
              </p>
            )}
            <p className="text-sm text-gray-500">
              {question.help ?? "A few words or bullet points are enough."}
            </p>
            {question.format === "rank" ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <Select
                    key={index}
                    id={`${id}-rank-${index}`}
                    label={`Priority ${index + 1}`}
                    value={options[index] ?? ""}
                    onChange={(e) => {
                      const next = [...options];
                      next[index] = e.target.value;
                      setOptions(next);
                      setState("answered");
                      changed();
                    }}
                    options={[
                      { value: "", label: "Still figuring it out" },
                      ...(question.options ?? []).map((o) => ({
                        value: o.id,
                        label: o.label,
                      })),
                    ]}
                  />
                ))}
              </div>
            ) : question.options?.length ? (
              <fieldset
                className={
                  question.key === "FIT_STATES"
                    ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
                    : "space-y-2"
                }
              >
                <legend className="mb-2 text-sm font-medium">
                  {question.format === "multi"
                    ? "Choose any that fit"
                    : "Choose what fits best today"}
                </legend>
                {question.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-sm has-checked:border-primary-500 has-checked:bg-primary-50"
                  >
                    <input
                      className="mt-1 accent-primary-600"
                      type={question.format === "multi" ? "checkbox" : "radio"}
                      name={`${id}-choice`}
                      value={option.id}
                      checked={options.includes(option.id)}
                      onChange={() => choose(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {(question.format === "text" ||
              !known ||
              options.includes("correction")) && (
              <Textarea
                id={`${id}-text`}
                label={
                  question.format === "text"
                    ? "Your response"
                    : "Anything to add? (optional)"
                }
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (["deferred", "declined"].includes(state))
                    setState("answered");
                  changed();
                }}
                rows={question.format === "text" ? 4 : 2}
                maxLength={6000}
                placeholder="Notes and small details are welcome."
              />
            )}
            {question.criterion && (
              <Select
                id={`${id}-importance`}
                label="How much does this matter?"
                value={importance}
                onChange={(e) => {
                  setImportance(
                    e.target.value as StructuredResponse["importance"],
                  );
                  changed();
                }}
                options={Object.entries(IMPORTANCE_LABELS).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            )}
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={state === "unsure"}
                onChange={(e) => {
                  setState(e.target.checked ? "unsure" : "answered");
                  changed();
                }}
              />
              I’m still figuring this out
            </label>
          </>
        )}
        <div
          className="space-y-2 border-t border-gray-100 pt-4"
          aria-describedby={`${id}-audience-note`}
        >
          {data.kind === "student" ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="share_with_family"
                checked={audience === "family"}
                onChange={(e) => {
                  setAudience(e.target.checked ? "family" : "counselor");
                  changed();
                }}
              />
              Allow my parents or guardians to see this response
            </label>
          ) : (
            <Select
              id={`${id}-audience`}
              label="Who can see this response"
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as "family" | "counselor");
                changed();
              }}
              options={[
                { value: "counselor", label: "You and your counseling team" },
                {
                  value: "family",
                  label: "Student, family and counseling team",
                },
              ]}
            />
          )}
          {(!legacy || convert) && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={discussion}
                onChange={(e) => {
                  setDiscussion(e.target.checked);
                  changed();
                }}
              />
              I’d like to discuss this further with my counselor
            </label>
          )}
          <p className="text-xs leading-5 text-gray-500">
            Sharing this response does not share a story, strategy brief, plan
            or essay. Those have their own sharing choices.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button icon="back"
            variant="outline"
            type="button"
            disabled={!canBack || dirty}
            onClick={onBack}
          >
            Back
          </Button>
          <Button type="submit" className="min-h-11">
            Save and continue
          </Button>
          <Button type="button" variant="outline" onClick={() => save("stay")}>
            Save response
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              save(
                "exit",
                !text && !options.length && !legacy ? "deferred" : undefined,
              )
            }
          >
            Save and exit
          </Button>
        </div>
        {(!legacy || convert) && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <button
              type="button"
              className="min-h-11 text-primary-700 underline"
              onClick={() => save("next", "deferred")}
            >
              Come back to this
            </button>
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-gray-500">
                Prefer not to answer?
              </summary>
              <p className="text-xs text-gray-500">
                You do not need to explain or choose a preference.
              </p>
              <Button icon="reject"
                variant="ghost"
                type="button"
                onClick={() => save("next", "declined")}
              >
                Decline this question
              </Button>
            </details>
          </div>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger-700">
          {error}
        </p>
      )}
      <p role="status" className="mt-3 text-xs text-gray-500">
        {pending ? "Saving your response…" : dirty ? "Unsaved changes" : notice}
      </p>
      {savedAnswer?.respondent_kind === "student" &&
        savedAnswer.state === "answered" &&
        savedAnswer.answer.trim() && (
          <Button
            type="button"
            className="mt-3"
            variant="outline"
            disabled={dirty || pending}
            onClick={() => onStory(savedAnswer)}
          >
            Save as story
          </Button>
        )}
    </form>
  );
}

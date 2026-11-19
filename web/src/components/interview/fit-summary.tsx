"use client";
import { ArrowLink } from "@/components/ui/arrow-link";

import { Button } from "@/components/ui/button";
import { answerStatus, IMPORTANCE_LABELS } from "@/lib/interview/conversation";
import {
  CRITERION_GAPS,
  fitPreferences,
  SUPPORTED_CRITERIA,
} from "@/lib/interview/fit";
import {
  questionFor,
  type InterviewAnswer,
  type InterviewWorkspace,
} from "@/lib/interview/template";

/** Receives only the workspace's authorized rows, including in service-role dev mode. */
export function FitSummary({
  data,
  onQuestion,
  onFollowup,
}: {
  data: InterviewWorkspace;
  onQuestion: (a: InterviewAnswer) => void;
  onFollowup: (a: InterviewAnswer) => void;
}) {
  const students = data.answers.filter((a) => a.respondent_kind === "student"),
    parents = data.answers.filter((a) => a.respondent_kind === "parent");
  const preferences = fitPreferences(students);
  return (
    <details
      className="rounded-xl border border-gray-200 bg-white p-5"
      open={data.kind === "staff"}
    >
      <summary className="cursor-pointer font-semibold">
        <h2 className="inline text-base">Priorities and counseling summary</h2>
      </summary>
      <p className="mt-3 text-sm text-gray-500">
        Student choices and parent perspectives stay separate. Profile fields
        stay as entered. Only direct size, setting, state and institution-type
        preferences can affect catalog matching; scenarios never supply a
        personality label.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {["P1", "A3", "J2", "P2", "P3"].map((key) => {
          const a = students.find((a) => a.question_key === key);
          return a ? (
            <div key={key}>
              <h3 className="text-xs font-semibold text-gray-500">
                {questionFor(key, "student")?.text}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {a.answer || answerStatus(a)}
              </p>
              <Button variant="ghost" size="sm" onClick={() => onQuestion(a)}>
                Open {key}
              </Button>
            </div>
          ) : null;
        })}
      </div>
      <ul className="mt-4 space-y-3">
        {preferences.map((p) => (
          <li key={p.answerId} className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium">
              {questionFor(p.questionKey, "student")?.text}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{p.text}</p>
            <p className="mt-2 text-xs text-gray-500">
              {p.status} · {IMPORTANCE_LABELS[p.importance]} · Source{" "}
              {p.questionKey}, v{p.version}, revision {p.revision}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {SUPPORTED_CRITERIA.includes(p.criterion)
                ? "Compared with available catalog attributes. Unknown college values remain unverified."
                : (CRITERION_GAPS[p.criterion] ??
                  "Needs counselor research; does not affect ranking.")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const a = students.find((a) => a.id === p.answerId);
                if (a) onQuestion(a);
              }}
            >
              Open response
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <h3 className="text-sm font-semibold">
          Uncertainties and questions to revisit
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600">
          {students
            .filter((a) => a.state !== "answered")
            .map((a) => (
              <li key={a.id}>
                <button
                  className="min-h-11 text-left text-primary-700 underline"
                  onClick={() => onQuestion(a)}
                >
                  {a.question_key} · {answerStatus(a)}
                </button>
              </li>
            ))}
        </ul>
      </div>
      {parents.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Parent perspectives</h3>
          <p className="mt-1 text-xs text-gray-500">
            Compare these in conversation; they do not override student
            preferences or change rankings.
          </p>
          {parents.map((a) => (
            <div key={a.id} className="mt-3 text-sm">
              <p className="text-xs text-gray-500">
                {
                  data.respondents.find((r) => r.id === a.respondent_user_id)
                    ?.name
                }{" "}
                · {a.question_key} · {answerStatus(a)}
              </p>
              <p className="whitespace-pre-wrap">{a.answer}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4">
        <h3 className="text-sm font-semibold">
          Requested counselor discussions
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          These requests are separate from answer completeness. One discussion
          follow-up is kept for each response.
        </p>
        {data.answers
          .filter((a) => a.discussion_requested)
          .map((a) => {
            const followup = data.followups.find(
              (f) => f.discussion_request && f.source_answer_id === a.id,
            );
            return (
              <div
                key={a.id}
                className="mt-3 flex flex-wrap items-center gap-3 text-sm"
              >
                <button
                  className="min-h-11 text-primary-700 underline"
                  onClick={() => onQuestion(a)}
                >
                  {a.question_key} ·{" "}
                  {data.respondents.find((r) => r.id === a.respondent_user_id)
                    ?.name ?? a.respondent_kind}
                </button>
                <span>
                  {followup ? `Follow-up ${followup.status}` : "Requested"} ·{" "}
                  {answerStatus(a)}
                </span>
                {data.canCounsel &&
                  (followup ? (
                    <ArrowLink icon="tasks" href={`#interview-followup-${followup.id}`}>
                      Open follow-up
                    </ArrowLink>
                  ) : (
                    <Button icon="messages"
                      variant="outline"
                      size="sm"
                      onClick={() => onFollowup(a)}
                    >
                      Start discussion follow-up
                    </Button>
                  ))}
              </div>
            );
          })}
      </div>
    </details>
  );
}

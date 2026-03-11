"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modals/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createConversation,
  sendMessage,
  loadConversationMessages,
} from "@/lib/actions/messages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ConversationSummary {
  id: string;
  conversation_type: string;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  student_name: string | null;
  participants: string[];
  last_message: string | null;
  last_message_at: string | null;
  last_sender: string | null;
}

interface Message {
  id: string;
  body: string;
  sent_at: string;
  edited_at: string | null;
  sender_id: string;
  sender_name: string;
  is_mine: boolean;
}

interface ConversationDetail {
  id: string;
  conversation_type: string;
  visibility_scope: string;
  student_name: string | null;
  participants: { id: string; name: string }[];
  messages: Message[];
  current_user_id: string;
}

// ---------------------------------------------------------------------------
// New Conversation Modal
// ---------------------------------------------------------------------------
function NewConversationModal({
  open,
  onClose,
  students,
  staff,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  onCreated: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createConversation(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.id) {
        onCreated(result.id);
        onClose();
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Conversation"
      description="Start a conversation with staff or about a student"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Select
          name="conversation_type"
          label="Type"
          options={[
            { value: "general", label: "General" },
            { value: "student_discussion", label: "Student Discussion" },
            { value: "parent_communication", label: "Parent Communication" },
          ]}
        />

        <Select
          name="student_id"
          label="Related Student"
          placeholder="None"
          options={students.map((s) => ({ value: s.id, label: s.name }))}
        />

        <Select
          name="participant_ids"
          label="Add Participant"
          placeholder="Select staff member"
          options={staff.map((s) => ({ value: s.id, label: s.name }))}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Message *
          </label>
          <textarea
            name="message"
            required
            rows={3}
            placeholder="Type your message..."
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Start Conversation"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Thread List Item
// ---------------------------------------------------------------------------
function ThreadItem({
  convo,
  isActive,
  onClick,
}: {
  convo: ConversationSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  const label =
    convo.student_name ??
    convo.participants.slice(0, 2).join(", ") ??
    "Conversation";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
        isActive ? "bg-primary-50" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-gray-900 truncate">
          {label}
        </span>
        {convo.last_message_at && (
          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
            {format(parseISO(convo.last_message_at), "MMM d")}
          </span>
        )}
      </div>
      {convo.last_message && (
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {convo.last_sender && (
            <span className="font-medium">{convo.last_sender.split(" ")[0]}: </span>
          )}
          {convo.last_message}
        </p>
      )}
      <Badge variant="default" className="mt-1">
        {convo.conversation_type.replace("_", " ")}
      </Badge>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------
function MessageBubble({ message }: { message: Message }) {
  return (
    <div
      className={`flex ${message.is_mine ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[75%] rounded-xl px-4 py-2 ${
          message.is_mine
            ? "bg-primary-600 text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        {!message.is_mine && (
          <p className="text-xs font-medium mb-0.5 opacity-70">
            {message.sender_name}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
        <p
          className={`text-[10px] mt-1 ${
            message.is_mine ? "text-white/60" : "text-gray-400"
          }`}
        >
          {format(parseISO(message.sent_at), "h:mm a")}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function MessagesClient({
  conversations,
  students,
  staff,
}: {
  conversations: ConversationSummary[];
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? conversations.filter(
        (c) =>
          c.student_name?.toLowerCase().includes(search.toLowerCase()) ||
          c.participants.some((p) =>
            p.toLowerCase().includes(search.toLowerCase())
          ) ||
          c.last_message?.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  async function loadConversation(id: string) {
    setActiveId(id);
    setLoadingDetail(true);
    const data = await loadConversationMessages(id);
    setDetail(data);
    setLoadingDetail(false);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  function handleSend() {
    if (!activeId || !messageText.trim()) return;
    const body = messageText;
    setMessageText("");

    // Optimistic: add message locally
    if (detail) {
      setDetail({
        ...detail,
        messages: [
          ...detail.messages,
          {
            id: `temp-${Date.now()}`,
            body,
            sent_at: new Date().toISOString(),
            edited_at: null,
            sender_id: detail.current_user_id,
            sender_name: "You",
            is_mine: true,
          },
        ],
      });
    }

    startTransition(async () => {
      await sendMessage(activeId, body);
      // Reload to get server-confirmed message
      const data = await loadConversationMessages(activeId);
      setDetail(data);
    });
  }

  return (
    <PageShell
      title="Messages"
      description="Communicate with students, parents, and staff"
      actions={
        <Button onClick={() => setShowNewModal(true)}>New Conversation</Button>
      }
    >
      <div
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        style={{ minHeight: "calc(100vh - 200px)" }}
      >
        {/* Thread List */}
        <div className="lg:col-span-4">
          <Card className="h-full flex flex-col">
            <div className="border-b border-gray-200 p-4">
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <CardContent>
                  <EmptyState
                    title="No conversations"
                    description="Start a new conversation to message students, parents, or staff."
                    actionLabel="New Conversation"
                    onAction={() => setShowNewModal(true)}
                  />
                </CardContent>
              ) : (
                filtered.map((c) => (
                  <ThreadItem
                    key={c.id}
                    convo={c}
                    isActive={activeId === c.id}
                    onClick={() => loadConversation(c.id)}
                  />
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Active Conversation */}
        <div className="lg:col-span-5">
          <Card className="h-full flex flex-col">
            {!activeId ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-500">
                  Select a conversation to view messages
                </p>
              </div>
            ) : loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-500">Loading...</p>
              </div>
            ) : detail ? (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4">
                  {detail.messages.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center mt-8">
                      No messages yet
                    </p>
                  ) : (
                    detail.messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Compose */}
                <div className="border-t border-gray-200 p-4">
                  <div className="flex gap-2">
                    <input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <Button onClick={handleSend} size="sm">
                      Send
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </Card>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardContent>
              {detail ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Type
                    </h3>
                    <Badge variant="default">
                      {detail.conversation_type.replace("_", " ")}
                    </Badge>
                  </div>

                  {detail.student_name && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">
                        Student
                      </h3>
                      <p className="text-sm text-gray-600">
                        {detail.student_name}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Participants
                    </h3>
                    {detail.participants.length === 0 ? (
                      <p className="text-sm text-gray-400">None</p>
                    ) : (
                      <ul className="space-y-1">
                        {detail.participants.map((p) => (
                          <li key={p.id} className="text-sm text-gray-600">
                            {p.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      Messages
                    </h3>
                    <p className="text-sm text-gray-600">
                      {detail.messages.length} message
                      {detail.messages.length !== 1 && "s"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-gray-500">
                  Conversation details will appear here
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <NewConversationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        students={students}
        staff={staff}
        onCreated={(id) => loadConversation(id)}
      />
    </PageShell>
  );
}

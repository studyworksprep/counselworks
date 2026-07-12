"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modals/modal";
import {
  loadConversationMessages,
  sendMessage,
  createPortalConversation,
} from "@/lib/actions/messages";
import { formatDateTime } from "@/lib/utils";
import {
  AttachmentChips,
  AttachFileButton,
} from "@/components/messages/attachments";

interface Conversation {
  id: string;
  conversation_type: string;
  updated_at: string;
  participants: { userId: string; name: string }[];
  lastMessage: {
    body: string;
    senderName: string;
    sentAt: string;
  } | null;
  messageCount: number;
  unreadCount: number;
}

interface Message {
  id: string;
  body: string;
  sent_at: string;
  sender_id: string;
  sender_name: string;
  is_mine: boolean;
  attachments?: { id: string; title: string }[];
}

/**
 * Shared student/family portal messaging surface: participant-scoped thread
 * list with unread badges, a reply thread, portal-initiated conversations,
 * and light polling so counselor replies appear without a manual reload.
 */
export function PortalMessages({
  conversations,
  emptyText,
}: {
  conversations: Conversation[];
  emptyText: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isSending, startSending] = useTransition();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [isCreating, startCreating] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for new activity: refresh the list and the open thread.
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
      if (selectedId) {
        loadConversationMessages(selectedId).then((result) => {
          if (result?.messages) setMessages(result.messages as Message[]);
        });
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [selectedId, router]);

  async function openConversation(id: string) {
    setSelectedId(id);
    setLoadingMessages(true);
    const result = await loadConversationMessages(id);
    if (result?.messages) {
      setMessages(result.messages as Message[]);
    }
    setLoadingMessages(false);
    router.refresh(); // clears the unread badge
  }

  function handleSend() {
    if (!selectedId || !messageText.trim()) return;
    const text = messageText;
    setMessageText("");
    startSending(async () => {
      await sendMessage(selectedId, text);
      const result = await loadConversationMessages(selectedId);
      if (result?.messages) {
        setMessages(result.messages as Message[]);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleCreate() {
    setNewError(null);
    startCreating(async () => {
      const formData = new FormData();
      formData.set("message", newMessage);
      const result = await createPortalConversation(formData);
      if ("error" in result && result.error) {
        setNewError(result.error);
        return;
      }
      setShowNewModal(false);
      setNewMessage("");
      router.refresh();
      if ("id" in result && result.id) {
        openConversation(result.id);
      }
    });
  }

  const newButton = (
    <Button size="sm" onClick={() => setShowNewModal(true)}>
      Message your counselor
    </Button>
  );

  const newModal = (
    <Modal
      open={showNewModal}
      onClose={() => !isCreating && setShowNewModal(false)}
      title="Message your counselor"
      description="Start a new conversation. Your counselor is notified by email."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => setShowNewModal(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            loading={isCreating}
            disabled={!newMessage.trim()}
          >
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          rows={4}
          placeholder="Type your message..."
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {newError && <p className="text-sm text-danger-500">{newError}</p>}
      </div>
    </Modal>
  );

  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent>
          <div className="space-y-3 py-4">
            <p className="text-sm text-gray-500">{emptyText}</p>
            {newButton}
          </div>
        </CardContent>
        {newModal}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{newButton}</div>
      <div className="flex gap-4 h-[calc(100vh-15rem)]">
        {/* Conversation list */}
        <Card className="w-80 shrink-0 overflow-y-auto">
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-100">
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <button
                    onClick={() => openConversation(conv.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      selectedId === conv.id ? "bg-primary-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-sm truncate ${
                          conv.unreadCount > 0
                            ? "font-bold text-gray-900"
                            : "font-medium text-gray-900"
                        }`}
                      >
                        {conv.participants.map((p) => p.name).join(", ") ||
                          "Conversation"}
                      </p>
                      {conv.unreadCount > 0 && (
                        <Badge variant="primary" className="shrink-0 ml-2">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {conv.lastMessage.senderName}: {conv.lastMessage.body}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Message thread */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {!selectedId ? (
            <CardContent className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-500">
                Select a conversation to view messages
              </p>
            </CardContent>
          ) : loadingMessages ? (
            <CardContent className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-500">Loading messages...</p>
            </CardContent>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.is_mine ? "items-end" : ""}`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {msg.sender_name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDateTime(msg.sent_at)}
                      </span>
                    </div>
                    <div
                      className={`text-sm mt-0.5 rounded-lg px-3 py-1.5 max-w-[80%] ${
                        msg.is_mine
                          ? "bg-primary-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                      <AttachmentChips
                        attachments={msg.attachments}
                        mine={msg.is_mine}
                      />
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div className="border-t border-gray-200 p-3 flex gap-2">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... (Enter to send)"
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <AttachFileButton
                  conversationId={selectedId}
                  caption={messageText}
                  onSent={() => {
                    setMessageText("");
                    if (selectedId) {
                      loadConversationMessages(selectedId).then((result) => {
                        if (result?.messages) {
                          setMessages(result.messages as Message[]);
                        }
                      });
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!messageText.trim() || isSending}
                  loading={isSending}
                  size="sm"
                >
                  Send
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
      {newModal}
    </div>
  );
}

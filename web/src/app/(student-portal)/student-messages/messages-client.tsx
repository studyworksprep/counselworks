"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadConversationMessages, sendMessage } from "@/lib/actions/messages";
import { formatDateTime } from "@/lib/utils";

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
}

interface Message {
  id: string;
  body: string;
  sent_at: string;
  sender_id: string;
  sender_name: string;
  is_mine: boolean;
}

export function StudentMessagesClient({
  conversations,
}: {
  conversations: Conversation[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isSending, startSending] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openConversation(id: string) {
    setSelectedId(id);
    setLoadingMessages(true);
    const result = await loadConversationMessages(id);
    if (result?.messages) {
      setMessages(result.messages as Message[]);
    }
    setLoadingMessages(false);
  }

  function handleSend() {
    if (!selectedId || !messageText.trim()) return;
    const text = messageText;
    setMessageText("");
    startSending(async () => {
      await sendMessage(selectedId, text);
      // Reload messages
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

  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-4 text-sm text-gray-500">
            No conversations yet. Your counselor will start a conversation with you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
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
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {conv.participants.map((p) => p.name).join(", ") || "Conversation"}
                    </p>
                    <Badge variant="outline" className="shrink-0 ml-2">
                      {conv.messageCount}
                    </Badge>
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
                <div key={msg.id} className={`flex flex-col ${msg.is_mine ? "items-end" : ""}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {msg.sender_name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDateTime(msg.sent_at)}
                    </span>
                  </div>
                  <p className={`text-sm mt-0.5 whitespace-pre-wrap rounded-lg px-3 py-1.5 max-w-[80%] ${
                    msg.is_mine
                      ? "bg-primary-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}>
                    {msg.body}
                  </p>
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
  );
}

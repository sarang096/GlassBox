"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const INITIAL_MESSAGES = [
  {
    role: "assistant",
    content:
      "Hello! I'm your AI Tutor. I can see the code in your editor. Tell me what you notice about it — what do you think it's supposed to do, and what happens when you trace through it?",
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  },
];

export default function TutorChat({ groupId, candidateName }) {
  const storageKey = `chat_session_${groupId}_${candidateName.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;

  const [messages, setMessages] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved chat:", e);
        }
      }
    }
    return INITIAL_MESSAGES;
  });
  
  const [input, setInput] = useState("");

  // Persist to localStorage whenever messages change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  // Track whether the user has manually scrolled up
  const isUserScrolledUp = useRef(false);

  // Resize textarea to fit its content (up to CSS max-height)
  const resizeTextarea = useCallback(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";        // reset so scrollHeight shrinks properly
    ta.style.height = ta.scrollHeight + "px";
  }, []);

  // Auto-scroll — only when not manually scrolled up
  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (force || !isUserScrolledUp.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Detect manual scroll
  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // Within 40 px of the bottom → considered "at bottom"
    isUserScrolledUp.current = distanceFromBottom > 40;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Resize textarea whenever input text changes
  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // Enter submits; Shift+Enter inserts newline
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Optimistically render user message
    const userMsg = { role: "user", content: trimmed, time: now };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    // Reset textarea height after clearing
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    // Force scroll after user sends
    isUserScrolledUp.current = false;
    setIsLoading(true);

    try {
      // 2. Call our proxy API
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          candidate_name: candidateName,
          message: trimmed,
        }),
      });

      const data = await res.json();

      // 3. Append assistant reply
      const replyTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "I couldn't form a response. Could you rephrase?",
          time: replyTime,
        },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm having trouble connecting. Please check your network and try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
      scrollToBottom(true);
    }
  };

  return (
    <div className="eval-chat-panel">
      {/* ── Chat Header ── */}
      <div className="eval-chat-header">
        <div className="eval-chat-avatar">🤖</div>
        <div className="eval-chat-header-info">
          <div className="eval-chat-title">AI Socratic Tutor</div>
          <div className="eval-chat-subtitle">
            <span className="eval-online-dot" />
            Powered by Gemini &middot; Guided Mode
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        className="eval-chat-messages"
        id="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
      >
        {messages.map((msg, i) => (
          <div key={i} className={`eval-msg ${msg.role}`}>
            <div className="eval-msg-bubble">{msg.content}</div>
            <div className="eval-msg-meta">
              {msg.role === "assistant" ? "AI Tutor" : candidateName} &middot; {msg.time}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="eval-msg assistant">
            <div className="eval-msg-bubble eval-msg-loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="eval-chat-input-area">
        <form className="eval-chat-form" onSubmit={handleSubmit} id="chat-form">
          <textarea
            ref={inputRef}
            className="eval-chat-input"
            id="chat-input"
            rows={1}
            placeholder={isLoading ? "Waiting for response..." : "How can I help you?"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            autoComplete="off"
          />
          <button
            className="eval-chat-send"
            id="chat-send-btn"
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

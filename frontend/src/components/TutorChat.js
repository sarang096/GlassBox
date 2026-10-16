"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const INITIAL_MESSAGES = [
  {
    role: "assistant",
    content:
      "Hello! I'm your AI Tutor. I can answer questions about your group's code and files. Ask me anything — what does a function do, how does a piece of code work, or where a feature is implemented!",
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    sources: [],
  },
];

// The AI tutor is the n8n workflow (ai_Eval.json), reached through the
// Next.js proxy at /api/chat. FastAPI has no chat endpoint — it only serves
// RAG retrieval to n8n.
//
// `groupCode` (not the numeric id) is what n8n keys sessions and scores on:
// its Injection Guard builds p_key as `{group_id}_{candidate_name}`, and the
// admin score lookup reads back with group_code. They must match.
export default function TutorChat({ groupCode, username }) {
  const storageKey = `rag_chat_${groupCode}`;

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
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isUserScrolledUp = useRef(false);

  // Persist to localStorage whenever messages change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);

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

  const handleClearChat = () => {
    setMessages(INITIAL_MESSAGES);
    localStorage.removeItem(storageKey);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Optimistically render user message
    const userMsg = { role: "user", content: trimmed, time: now, sources: [] };
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
      // 2. Ask the n8n tutor via the Next.js proxy. n8n runs the injection
      //    guard, pulls RAG context, answers, and scores the prompt.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupCode,
          candidate_name: username || "Anonymous",
          message: trimmed,
        }),
      });

      // The proxy always returns a JSON body carrying a `reply`, including on
      // its 5xx paths, so render whatever came back rather than throwing.
      const data = await res.json().catch(() => ({}));

      // 3. Append assistant reply with sources
      const replyTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "I couldn't form a response. Could you rephrase?",
          time: replyTime,
          sources: data.sources || [],
          flagged: data.flagged === true,
        },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm having trouble reaching the AI Tutor. Check that n8n is running, then try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          sources: [],
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
          <div className="eval-chat-title">AI Tutor</div>
          <div className="eval-chat-subtitle">
            <span className="eval-online-dot" />
            RAG-Powered &middot; Knows Your Code
          </div>
        </div>
        <button
          className="eval-chat-clear-btn"
          onClick={handleClearChat}
          title="Clear chat history"
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: '4px 10px',
            fontSize: 12,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.color = 'rgba(255,255,255,0.9)';
            e.target.style.borderColor = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.color = 'rgba(255,255,255,0.5)';
            e.target.style.borderColor = 'rgba(255,255,255,0.15)';
          }}
        >
          🗑 Clear
        </button>
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
            <div className="eval-msg-bubble">
              {msg.content}
              {/* Show source citations for assistant messages */}
              {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                <div className="eval-msg-sources">
                  <div className="eval-msg-sources-label">📎 Related files:</div>
                  {msg.sources.map((src, j) => (
                    <div key={j} className="eval-msg-source-item">
                      <span className="eval-msg-source-file">📄 {src.filename}</span>
                      {/* Snippets are reference-solution text and are no longer
                          sent by the API. Render only if one is ever present. */}
                      {src.snippet ? (
                        <code className="eval-msg-source-snippet">{src.snippet}</code>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="eval-msg-meta">
              {msg.role === "assistant" ? "AI Tutor" : (username || "You")} &middot; {msg.time}
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
            placeholder={isLoading ? "Thinking..." : "Ask about your code..."}
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

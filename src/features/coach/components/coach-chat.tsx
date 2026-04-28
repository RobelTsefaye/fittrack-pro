"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { Bot, Send, Sparkles, User, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-provider";

const SUGGESTIONS = [
  "coach.suggest1",
  "coach.suggest2",
  "coach.suggest3",
  "coach.suggest4",
] as const;

/** Extract plain text from a UIMessage's parts (SDK v6) */
function messageText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

const transport = new DefaultChatTransport({ api: "/api/chat" });

export function CoachChat() {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error, regenerate } = useChat({ transport });

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function submit() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "2rem";
    }
    void sendMessage({ text });
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function pickSuggestion(key: string) {
    setInput(t(key as Parameters<typeof t>[0]));
    inputRef.current?.focus();
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col lg:h-[calc(100dvh-2rem)]">

      {/* ── Header ──────────────────────────────────── */}
      <div className="shrink-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="page-title leading-none">{t("coach.title")}</h1>
            <p className="text-sm text-[var(--sys-label2)]">{t("coach.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
        <div className="space-y-4 pb-4">

          {/* Empty state + suggestions */}
          {isEmpty && (
            <div className="space-y-5 pt-2">
              <div className="ios-group px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-[0.9375rem] text-[var(--sys-label)]">
                    {t("coach.intro")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="ios-section-label">{t("coach.suggestLabel")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pickSuggestion(key)}
                      className="ios-row cursor-pointer rounded-xl bg-[var(--card)] text-left text-sm font-medium hover:bg-[var(--nav-hover-bg)] transition-colors shadow-sm shadow-black/[0.04]"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="flex-1">{t(key as Parameters<typeof t>[0])}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const text = messageText(msg);
            if (!text) return null;

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex items-end gap-2.5",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                {!isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 mb-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed",
                    isUser
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-[var(--card)] text-[var(--sys-label)] shadow-sm shadow-black/[0.04]"
                  )}
                >
                  {text.split("\n").map((line, i, arr) => (
                    <span key={i}>
                      {line}
                      {i < arr.length - 1 && <br />}
                    </span>
                  ))}
                </div>

                {isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--sys-fill2)] mb-0.5">
                    <User className="h-3.5 w-3.5 text-[var(--sys-label2)]" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex items-end gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 mb-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-[var(--card)] px-4 py-3 shadow-sm shadow-black/[0.04]">
                <span className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-[var(--sys-label3)] animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t("coach.error")}</span>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="shrink-0 rounded-lg p-1 hover:bg-destructive/10 transition-colors"
                aria-label={t("coach.retry")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar ───────────────────────────────── */}
      <div className="shrink-0 pt-3">
        <div className="flex items-end gap-2 rounded-2xl bg-[var(--card)] px-3 py-2 shadow-sm shadow-black/[0.04] ring-1 ring-[var(--sys-separator)] focus-within:ring-primary/40 transition-shadow">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder={t("coach.placeholder")}
            disabled={isLoading}
            className="min-h-[2rem] flex-1 resize-none bg-transparent text-[0.9375rem] leading-relaxed text-foreground placeholder:text-muted-foreground/50 outline-none"
            style={{ height: "2rem" }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || isLoading}
            aria-label={t("coach.send")}
            className={cn(
              "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all",
              input.trim() && !isLoading
                ? "bg-primary text-primary-foreground active:scale-95"
                : "bg-[var(--sys-fill2)] text-[var(--sys-label3)]"
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[0.6875rem] text-[var(--sys-label3)]">
          {t("coach.disclaimer")}
        </p>
      </div>
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { Messages } from "@/lib/i18n-types";
import type { UiLocale } from "@/lib/i18n-config";

export type { Messages } from "@/lib/i18n-types";

function interpolate(
  template: string,
  vars?: Record<string, string | number | undefined>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v !== undefined && v !== null ? String(v) : `{${key}}`;
  });
}

function getNested(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

type I18nContextValue = {
  locale: UiLocale;
  t: (key: string, vars?: Record<string, string | number | undefined>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: UiLocale;
  messages: Messages;
  children: ReactNode;
}) {
  const t = useCallback(
    (key: string, vars?: Record<string, string | number | undefined>) => {
      const raw = getNested(messages as unknown as Record<string, unknown>, key);
      if (typeof raw !== "string") return key;
      return interpolate(raw, vars);
    },
    [messages]
  );

  const value = useMemo(() => ({ locale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

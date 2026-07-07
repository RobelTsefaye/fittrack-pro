"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n-provider";
import { storeBackgroundSyncToken } from "@/lib/native/sync-token";

type TokenRow = {
  id: string;
  name: string | null;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function ApiTokensCard() {
  const { t } = useI18n();
  const [rows, setRows] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [syncTokenStored, setSyncTokenStored] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/tokens", { credentials: "include", cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      data?: TokenRow[];
      error?: string;
      detail?: string;
      hint?: string;
    };
    if (!res.ok) {
      setRows([]);
      if (res.status === 401) {
        setLoadError(t("settings.apiTokensErrSession"));
      } else {
        const parts = [json.detail || json.error, json.hint].filter(Boolean);
        setLoadError(parts.length ? parts.join(" — ") : t("settings.apiTokensErrLoad", { code: res.status }));
      }
      return;
    }
    setLoadError(null);
    setRows(json.data ?? []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createToken() {
    setCreating(true);
    setCreateError(null);
    setNewSecret(null);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: TokenRow & { token?: string };
        error?: string;
        detail?: string;
        hint?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setCreateError(t("settings.apiTokensErrSession"));
        } else {
          const parts = [json.detail || json.error, json.hint].filter(Boolean);
          setCreateError(
            parts.length ? parts.join(" — ") : t("settings.apiTokensErrCreateHttp", { code: res.status })
          );
        }
        return;
      }
      const secret = json.data?.token;
      if (!secret) {
        setCreateError(t("settings.apiTokensErrNoSecret"));
        return;
      }
      setNewSecret(secret);
      setName("");
      void load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) return;
    void load();
  }

  async function copySecret() {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
  }

  async function useForBackgroundSync() {
    if (!newSecret) return;
    const ok = await storeBackgroundSyncToken(newSecret);
    setSyncTokenStored(ok);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.apiTokensTitle")}</CardTitle>
        <CardDescription>{t("settings.apiTokensDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("settings.apiTokensClaudeHint")}</p>

        {loadError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}

        {createError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {createError}
          </p>
        ) : null}

        {newSecret ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-2">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {t("settings.apiTokensNewOnce")}
            </p>
            <code className="block break-all rounded bg-muted px-2 py-1.5 text-xs">{newSecret}</code>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => void copySecret()}>
                {t("settings.apiTokensCopy")}
              </Button>
              {Capacitor.isNativePlatform() && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={syncTokenStored}
                  onClick={() => void useForBackgroundSync()}
                >
                  {syncTokenStored ? "Für Hintergrund-Sync aktiviert" : "Für Hintergrund-Sync verwenden"}
                </Button>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="api-token-name">{t("settings.apiTokensNameLabel")}</Label>
            <Input
              id="api-token-name"
              placeholder={t("settings.apiTokensNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <Button type="button" onClick={() => void createToken()} disabled={creating}>
            {creating ? t("common.loading") : t("settings.apiTokensCreate")}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("settings.apiTokensListLabel")}</p>
          {rows === null ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.apiTokensEmpty")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="font-mono text-xs">{r.tokenPrefix}</span>
                    {r.name ? (
                      <span className="ml-2 text-muted-foreground">— {r.name}</span>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {r.lastUsedAt
                        ? t("settings.apiTokensLastUsed", {
                            date: new Date(r.lastUsedAt).toLocaleString(),
                          })
                        : t("settings.apiTokensNeverUsed")}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={busyId === r.id}
                    onClick={() => void revoke(r.id)}
                  >
                    {t("settings.apiTokensRevoke")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

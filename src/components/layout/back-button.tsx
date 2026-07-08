"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";
import { ROUTES } from "@/lib/constants";

/**
 * Back-navigation button for top-level pages that are only reachable via the
 * "Mehr" (More) menu on mobile (health, records, body-weight, plate-
 * calculator, settings, exercises) — those pages aren't primary bottom-tab
 * destinations, so unlike dashboard/workouts/coach/plans there's no other
 * one-tap way back. Always returns to "Mehr" (rather than router.back())
 * since that's the only place these pages are linked from on mobile, and a
 * fixed destination is predictable regardless of how the page was reached.
 */
export function BackButton() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 mb-1 inline-flex gap-1 text-[var(--sys-label2)]"
      onClick={() => router.push(ROUTES.more)}
    >
      <ArrowLeft className="h-4 w-4" />
      {t("common.back")}
    </Button>
  );
}

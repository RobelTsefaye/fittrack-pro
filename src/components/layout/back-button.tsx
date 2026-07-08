"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";

/**
 * Back-navigation button for top-level pages that are only reachable via the
 * "Mehr" (More) menu on mobile (health, records, body-weight, plate-
 * calculator, settings, exercises) — those pages aren't primary bottom-tab
 * destinations, so unlike dashboard/workouts/coach/plans there's no other
 * one-tap way back. Uses router.back() rather than a fixed href since all of
 * these pages can be reached from either "Mehr" directly or from a link
 * elsewhere in the app.
 */
export function BackButton() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 mb-1 inline-flex gap-1 text-[var(--sys-label2)]"
      onClick={() => router.back()}
    >
      <ArrowLeft className="h-4 w-4" />
      {t("common.back")}
    </Button>
  );
}

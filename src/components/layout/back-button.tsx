"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";
import { ROUTES } from "@/lib/constants";

/**
 * Back-navigation button for pages below a tab (settings sub-pages, exercise
 * details). A fixed destination is predictable regardless of how the page was
 * reached; the default is the settings overview.
 */
export function BackButton({ href = ROUTES.settings }: { href?: string }) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 mb-1 inline-flex gap-1 text-[var(--sys-label2)]"
      onClick={() => router.push(href)}
    >
      <ArrowLeft className="h-4 w-4" />
      {t("common.back")}
    </Button>
  );
}

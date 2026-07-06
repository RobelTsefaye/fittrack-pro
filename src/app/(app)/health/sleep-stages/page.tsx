import { redirect } from "next/navigation";

// Sleep duration and sleep stages were merged into a single page.
export default function SleepStagesRedirect() {
  redirect("/health/sleep");
}

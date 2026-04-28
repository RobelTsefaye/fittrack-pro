import { CoachChat } from "@/features/coach/components/coach-chat";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `AI Coach — ${APP_NAME}` };

export default function CoachPage() {
  return <CoachChat />;
}

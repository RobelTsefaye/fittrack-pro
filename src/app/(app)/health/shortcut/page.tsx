import { APP_NAME } from "@/lib/constants";
import { ShortcutGuide } from "@/features/health/components/shortcut-guide";

export const metadata = { title: `iOS Shortcut Setup — ${APP_NAME}` };

export default function ShortcutPage() {
  return <ShortcutGuide />;
}

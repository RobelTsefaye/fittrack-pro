import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `New workout — ${APP_NAME}` };

export default function NewWorkoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

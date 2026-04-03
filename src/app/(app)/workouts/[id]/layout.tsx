import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Workout — ${APP_NAME}` };

export default function WorkoutDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

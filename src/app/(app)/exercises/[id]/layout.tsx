import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Exercise — ${APP_NAME}` };

export default function ExerciseDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

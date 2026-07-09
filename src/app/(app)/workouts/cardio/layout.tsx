import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Cardio — ${APP_NAME}` };

export default function CardioWorkoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

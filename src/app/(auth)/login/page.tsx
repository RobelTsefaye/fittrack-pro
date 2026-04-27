import { LoginForm } from "@/features/auth/components/login-form";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Sign In — ${APP_NAME}` };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--sys-grouped-bg)] px-4 py-16">
      <LoginForm />
    </main>
  );
}

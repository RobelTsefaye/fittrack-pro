import { LoginForm } from "@/features/auth/components/login-form";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Sign In — ${APP_NAME}` };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <LoginForm />
    </main>
  );
}

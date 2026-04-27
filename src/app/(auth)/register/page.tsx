import { RegisterForm } from "@/features/auth/components/register-form";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Sign Up — ${APP_NAME}` };

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--sys-grouped-bg)] px-4 py-16">
      <RegisterForm />
    </main>
  );
}

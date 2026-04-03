import { RegisterForm } from "@/features/auth/components/register-form";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Sign Up — ${APP_NAME}` };

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <RegisterForm />
    </main>
  );
}

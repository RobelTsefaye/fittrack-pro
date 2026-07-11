import { RegisterForm } from "@/features/auth/components/register-form";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Sign Up — ${APP_NAME}` };

export default function RegisterPage() {
  // Same rationale as the login page — a logged-in user reaching this via
  // the landing "Get Started" button shouldn't be stranded here offline.
  return (
    <RedirectIfAuthenticated>
      <main className="flex min-h-screen items-center justify-center bg-[var(--sys-grouped-bg)] px-4 py-16">
        <RegisterForm />
      </main>
    </RedirectIfAuthenticated>
  );
}

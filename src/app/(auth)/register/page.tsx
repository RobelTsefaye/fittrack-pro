import { connection } from "next/server";
import { RegisterForm } from "@/features/auth/components/register-form";
import { RegistrationClosed } from "@/features/auth/components/registration-closed";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";
import { APP_NAME } from "@/lib/constants";
import { isRegistrationOpen } from "@/lib/registration";

export const metadata = { title: `Sign Up — ${APP_NAME}` };

export default async function RegisterPage() {
  // Native (static export): kein Server zur Laufzeit; dort lehnt der Server die
  // Registrierung per 403 ab (Meldung im Formular).
  let open = true;
  if (process.env.NATIVE_BUILD !== "1") {
    await connection();
    open = await isRegistrationOpen();
  }

  // Same rationale as the login page — a logged-in user reaching this via
  // the landing "Get Started" button shouldn't be stranded here offline.
  return (
    <RedirectIfAuthenticated>
      <main className="flex min-h-screen items-center justify-center bg-[var(--sys-grouped-bg)] px-4 py-16">
        {open ? <RegisterForm /> : <RegistrationClosed />}
      </main>
    </RedirectIfAuthenticated>
  );
}

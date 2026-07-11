import { LoginForm } from "@/features/auth/components/login-form";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: `Sign In — ${APP_NAME}` };

export default function LoginPage() {
  // On native (static export, no server middleware) an already-logged-in
  // user has a valid Keychain token but nothing was ever routing them off
  // this page to the dashboard — so offline, where a fresh login can't
  // succeed, they were stranded on the login screen despite being
  // authenticated. RedirectIfAuthenticated (built for exactly this in
  // Phase 2 but never actually wired in anywhere) sends them straight to
  // the dashboard the moment the token resolves.
  return (
    <RedirectIfAuthenticated>
      <main className="flex min-h-screen items-center justify-center bg-[var(--sys-grouped-bg)] px-4 py-16">
        <LoginForm />
      </main>
    </RedirectIfAuthenticated>
  );
}

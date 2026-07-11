import { LandingView } from "@/components/landing-view";
import { RedirectIfAuthenticated } from "@/components/auth/redirect-if-authenticated";

export default function LandingPage() {
  // Cold-start on native loads this route (index.html of the static export).
  // A logged-in user with a valid Keychain token should land on the app,
  // not the marketing page — see the login page for the full rationale.
  return (
    <RedirectIfAuthenticated>
      <LandingView />
    </RedirectIfAuthenticated>
  );
}

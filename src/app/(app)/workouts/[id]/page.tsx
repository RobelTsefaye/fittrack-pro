import { Suspense } from "react";
import { WorkoutPageClient } from "./page-client";

// `generateStaticParams` must live in a Server Component file — it can't be
// exported alongside "use client". The real id is read client-side via
// useParams() (web) or useSearchParams() (native, see workout-href.ts) in
// page-client.tsx; this placeholder only satisfies `output: "export"`'s
// requirement that every dynamic segment enumerate at least one path to
// pre-render a shell for (project-docs/offline-first-roadmap.md Phase 2).
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function WorkoutPage() {
  return (
    <Suspense>
      <WorkoutPageClient />
    </Suspense>
  );
}

import { prisma } from "@/lib/prisma";

/** `FITTRACK_REGISTRATION`: "open" erlaubt Registrierung, alles andere (Standard) = "closed". */
export function registrationMode(): "open" | "closed" {
  return process.env.FITTRACK_REGISTRATION?.trim().toLowerCase() === "open" ? "open" : "closed";
}

/**
 * Registrierung erlaubt? Bei "closed" nur, solange noch kein Nutzer existiert
 * (Erst-Einrichtung einer neuen Instanz).
 */
export async function isRegistrationOpen(): Promise<boolean> {
  if (registrationMode() === "open") return true;
  const anyUser = await prisma.user.findFirst({ select: { id: true } });
  return anyUser === null;
}

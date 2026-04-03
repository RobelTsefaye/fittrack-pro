import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

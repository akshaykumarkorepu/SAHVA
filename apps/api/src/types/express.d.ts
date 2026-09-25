import type { Db } from "../lib/supabase.js";
import type { Enums } from "@sahva/types";
import type { Logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, echoed back as `x-request-id`. */
      id: string;
      log: Logger;
      /** Present only after `requireAuth`. */
      auth?: {
        userId: string;
        email: string | null;
        clinicId: string;
        role: Enums<"staff_role">;
        /** RLS-scoped client for this user. Prefer this over dbAdmin. */
        db: Db;
      };
      /** Present only after `requireServiceKey`. */
      machine?: { caller: "voice" | "telephony" | "worker" };
    }
  }
}

export {};

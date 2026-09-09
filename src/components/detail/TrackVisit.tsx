"use client";

import { useEffect } from "react";
import { pushRecent, recordVisit } from "@/lib/local";

/** Records "recently viewed" + daily streak in localStorage. Renders nothing. */
export function TrackVisit({ id }: { id: string }) {
  useEffect(() => {
    pushRecent(id);
    recordVisit();
  }, [id]);
  return null;
}

"use client";

import { useSearchParams } from "next/navigation";
import { PathFinder } from "./PathFinder";

/** Reads ?from= and ?to= so a route is shareable, then hands over to the finder. */
export function PathQuery() {
  const params = useSearchParams();
  return <PathFinder initialFrom={params.get("from") ?? undefined} initialTo={params.get("to") ?? undefined} />;
}

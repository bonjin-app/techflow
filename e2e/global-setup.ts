import fs from "node:fs";
import path from "node:path";

/**
 * Refuse to run against a server that is not serving this build.
 *
 * `reuseExistingServer` is on locally, which is convenient and once cost an
 * hour: a server left over from a base-path build was still listening on 4321,
 * Playwright reused it, and a whole suite "passed" against an artefact that had
 * nothing to do with the working tree. A stale server is indistinguishable from
 * a correct one until the results make no sense.
 */
export default async function globalSetup() {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  const url = `http://localhost:4321${base}/`;
  const local = path.join(process.cwd(), "out", "index.html");

  if (!fs.existsSync(local)) throw new Error("out/index.html is missing — run `pnpm build` before `pnpm e2e`.");

  let served: string;
  try {
    const res = await fetch(url);
    if (!res.ok) return; // no server yet; Playwright is about to start one
    served = await res.text();
  } catch {
    return; // nothing listening, which is the normal case
  }

  if (served !== fs.readFileSync(local, "utf8")) {
    throw new Error(
      `A server is already listening on 4321 and is not serving this build.\n` +
        `It was reused instead of starting a fresh one, so the suite would have tested the wrong artefact.\n` +
        `Stop it (pkill -f serve-out.mjs) and run again.`,
    );
  }
}

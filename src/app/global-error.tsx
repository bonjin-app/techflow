"use client";

/**
 * The last resort: the root layout itself failed, so there is no header, no
 * theme and no fonts to rely on. Everything here is inline for that reason.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0b0c0e", color: "#f4f5f7", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "80px 24px" }}>
          <p style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#6b7280", margin: 0 }}>TechFlow</p>
          <h1 style={{ fontSize: 34, margin: "8px 0 0", letterSpacing: -1 }}>The site failed to start.</h1>
          <p style={{ color: "#9aa3b2", lineHeight: 1.6 }}>
            Something went wrong before the page could render. Reloading is worth trying; the browser console has the detail.
          </p>
          {error.digest && <p style={{ color: "#6b7280", fontFamily: "monospace", fontSize: 12 }}>digest {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, padding: "8px 14px", borderRadius: 6, border: "1px solid #2a2d33", background: "transparent", color: "#f4f5f7", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

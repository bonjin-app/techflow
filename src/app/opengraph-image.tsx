import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

/**
 * One card for the whole site, generated at build time. `summary_large_image`
 * was already declared in the metadata with no image behind it, which renders as
 * a blank card wherever the site is shared.
 */
// A static export renders this at build time only with the handler marked static.
export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${site.name} — ${site.tagline}`;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0c0e",
          color: "#f4f5f7",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* the same three-node mark as the header logo */}
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="6" r="2.2" fill="#6b7cff" />
          <circle cx="19" cy="6" r="2.2" fill="#6b7cff" />
          <circle cx="12" cy="18" r="2.2" fill="#6b7cff" />
          <circle cx="12" cy="10" r="1.6" fill="#6b7cff" opacity="0.6" />
          <path d="M5 6 12 10 19 6M12 10v8" stroke="#6b7cff" strokeWidth="1.5" opacity="0.7" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>Understand technology.</div>
          <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, color: "#9aa3b2" }}>See how it connects.</div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#9aa3b2" }}>
            An interactive knowledge graph for developers — trade-offs, live diagrams and learning paths.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, color: "#6b7280" }}>
          <span style={{ color: "#6b7cff" }}>{site.name}</span>
          <span>·</span>
          <span>{site.url.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    ),
    size,
  );
}

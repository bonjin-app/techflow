export interface PlaygroundMeta {
  slug: string;
  title: string;
  blurb: string;
  icon: string;
  description: string;
  concepts: { label: string; href: string }[];
}

export const PLAYGROUNDS: PlaygroundMeta[] = [
  {
    slug: "cache",
    title: "Cache Simulator",
    blurb: "Capacity, eviction policy, access pattern, TTL — watch the hit ratio respond.",
    icon: "⚡",
    description:
      "A cache is a bet that recent or frequent keys will be asked for again. This simulator lets you change the bet — capacity, eviction policy, TTL — and the traffic shape, and shows the hit ratio, database reads and average latency in real time.",
    concepts: [
      { label: "Cache", href: "/concept/cache" },
      { label: "Cache Aside", href: "/pattern/cache-aside" },
      { label: "TTL", href: "/concept/ttl" },
      { label: "Redis", href: "/technology/redis" },
    ],
  },
  {
    slug: "load-balancer",
    title: "Load Balancer Simulator",
    blurb: "Round robin vs least connections vs IP hash. Kill a server and see what happens.",
    icon: "⇶",
    description:
      "Load balancing looks trivial until servers have different speeds, clients need sticky sessions, or a server dies mid-traffic. Pick an algorithm, tune the request rate, take a server down, and watch how requests distribute.",
    concepts: [
      { label: "Load Balancing", href: "/concept/load-balancing" },
      { label: "Session", href: "/concept/session" },
      { label: "Nginx", href: "/technology/nginx" },
      { label: "Availability", href: "/concept/availability" },
    ],
  },
  {
    slug: "jwt",
    title: "JWT Decoder",
    blurb: "Header · payload · signature, colour-coded, with expiry — decoded locally, never verified.",
    icon: "🔑",
    description:
      "A JSON Web Token is three base64url segments. Two of them are readable by anyone — which is exactly why the third, the signature, matters. Paste a token to see its structure and claims, and to be reminded that decoding is not verification.",
    concepts: [
      { label: "Authentication", href: "/concept/authentication" },
      { label: "Session", href: "/concept/session" },
      { label: "HTTPS", href: "/concept/https" },
    ],
  },
];

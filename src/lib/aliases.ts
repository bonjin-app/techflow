/**
 * What people type instead of the page's name. Shared by the question reader
 * and by search — "k8s" found nothing in search while the question reader
 * already knew it, because each had its own idea of the vocabulary.
 */
export const ALIASES: Record<string, string> = {
  postgres: "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  k8s: "kubernetes",
  kube: "kubernetes",
  rabbit: "rabbitmq",
  "node js": "nodejs",
  node: "nodejs",
  "next js": "nextjs",
  websockets: "websocket",
  webhooks: "webhook",
  embeddings: "embedding",
  "vector db": "vector-database",
  "vector store": "vector-database",
  llms: "llm",
  agents: "ai-agent",
  microservice: "microservices",
  queues: "message-queue",
  queue: "message-queue",
  adr: "architecture-decision-record",
  ddd: "domain-driven-design",
  a11y: "accessibility",
  iac: "infrastructure-as-code",
  otel: "opentelemetry",
  gha: "github-actions",
  mq: "message-queue",
  "2pc": "two-phase-commit",
  owasp: "owasp-top-10",
  rn: "react-native",
  // Standard in this domain, and each has exactly one page it could mean here.
  // Deliberately absent: "es" (Elasticsearch or ECMAScript), "js" (no
  // JavaScript page to land on) and "cd" (CDN is as likely as continuous
  // delivery) — an alias that guesses wrong is worse than a fuzzy match.
  oidc: "oauth",
  sso: "oauth",
  saml: "oauth",
  gql: "graphql",
  pg: "postgresql",
  k8: "kubernetes",
  ts: "typescript",
  tf: "terraform",
  ws: "websocket",
  lb: "load-balancing",
};

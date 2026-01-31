export const navItems = [
  { label: "Projects", href: "/projects" },
  { label: "My Recent", href: "/recent" },
  { label: "Team", href: "/team" },
  { label: "Settings", href: "/settings" },
];

type Session = {
  id: string;
  status: "running" | "idle" | "complete";
  title: string;
  lastMessage: string;
};

type Project = {
  id: string;
  name: string;
  sessions: Session[];
};

export const mockProjects: Project[] = [
  {
    id: "1",
    name: "opencode-web",
    sessions: [
      {
        id: "a1b2c3",
        status: "running",
        title: "Add auth flow",
        lastMessage: "Implementing OAuth provider...",
      },
      { id: "d4e5f6", status: "complete", title: "Fix navbar bug", lastMessage: "Done" },
      {
        id: "x7y8z9",
        status: "complete",
        title: "Add dark mode",
        lastMessage: "Theme toggle working",
      },
      {
        id: "m1n2o3",
        status: "idle",
        title: "Optimize bundle size",
        lastMessage: "Analyzing dependencies",
      },
    ],
  },
  {
    id: "2",
    name: "api-service",
    sessions: [
      {
        id: "g7h8i9",
        status: "idle",
        title: "Refactor endpoints",
        lastMessage: "Waiting for review",
      },
      {
        id: "p4q5r6",
        status: "running",
        title: "Add rate limiting",
        lastMessage: "Testing middleware...",
      },
      {
        id: "s7t8u9",
        status: "complete",
        title: "Fix memory leak",
        lastMessage: "Deployed to prod",
      },
    ],
  },
  {
    id: "3",
    name: "mobile-app",
    sessions: [
      {
        id: "v1w2x3",
        status: "running",
        title: "Push notifications",
        lastMessage: "Setting up Firebase...",
      },
      { id: "y4z5a6", status: "complete", title: "Biometric auth", lastMessage: "Face ID working" },
      {
        id: "b7c8d9",
        status: "complete",
        title: "Offline mode",
        lastMessage: "SQLite sync complete",
      },
      {
        id: "e0f1g2",
        status: "idle",
        title: "App store submission",
        lastMessage: "Screenshots ready",
      },
      {
        id: "h3i4j5",
        status: "complete",
        title: "Deep linking",
        lastMessage: "Universal links configured",
      },
    ],
  },
  {
    id: "4",
    name: "data-pipeline",
    sessions: [
      { id: "k6l7m8", status: "complete", title: "ETL optimization", lastMessage: "3x faster now" },
      {
        id: "n9o0p1",
        status: "running",
        title: "Add Kafka consumer",
        lastMessage: "Processing events...",
      },
      { id: "q2r3s4", status: "idle", title: "Schema migration", lastMessage: "Backup complete" },
    ],
  },
  {
    id: "5",
    name: "design-system",
    sessions: [
      {
        id: "t5u6v7",
        status: "complete",
        title: "Button variants",
        lastMessage: "All states documented",
      },
      {
        id: "w8x9y0",
        status: "complete",
        title: "Form components",
        lastMessage: "Validation working",
      },
      { id: "z1a2b3", status: "running", title: "Data tables", lastMessage: "Adding sorting..." },
      {
        id: "c4d5e6",
        status: "idle",
        title: "Charts library",
        lastMessage: "Evaluating D3 vs Recharts",
      },
      { id: "f7g8h9", status: "complete", title: "Icon set", lastMessage: "200 icons added" },
      {
        id: "i0j1k2",
        status: "complete",
        title: "Typography scale",
        lastMessage: "Fluid sizing done",
      },
    ],
  },
  {
    id: "6",
    name: "infra-terraform",
    sessions: [
      {
        id: "l3m4n5",
        status: "complete",
        title: "K8s cluster setup",
        lastMessage: "3 nodes running",
      },
      {
        id: "o6p7q8",
        status: "idle",
        title: "Add monitoring",
        lastMessage: "Prometheus configured",
      },
    ],
  },
  {
    id: "7",
    name: "docs-site",
    sessions: [
      {
        id: "r9s0t1",
        status: "running",
        title: "API reference",
        lastMessage: "Generating from OpenAPI...",
      },
      { id: "u2v3w4", status: "complete", title: "Quick start guide", lastMessage: "Published" },
      {
        id: "x5y6z7",
        status: "complete",
        title: "Migration guide v2",
        lastMessage: "Examples added",
      },
      { id: "a8b9c0", status: "idle", title: "Video tutorials", lastMessage: "Script drafted" },
    ],
  },
  {
    id: "8",
    name: "analytics-dashboard",
    sessions: [
      {
        id: "d1e2f3",
        status: "complete",
        title: "Real-time metrics",
        lastMessage: "WebSocket streaming",
      },
      {
        id: "g4h5i6",
        status: "running",
        title: "Custom reports",
        lastMessage: "Building PDF export...",
      },
      {
        id: "j7k8l9",
        status: "complete",
        title: "User segmentation",
        lastMessage: "Cohort analysis live",
      },
    ],
  },
];

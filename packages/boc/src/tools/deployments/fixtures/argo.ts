export const argoApplicationFixtures = [
  {
    metadata: { name: "shop-dev-02", labels: { app: "shop", environment: "02" } },
    spec: {
      destination: { namespace: "shop-dev-02" },
      source: { targetRevision: "SHOP-617-product-gallery" },
      syncPolicy: { automated: { prune: true, selfHeal: true } },
    },
    status: {
      sync: { status: "Synced", revision: "3909da1" },
      health: { status: "Healthy" },
      history: [{ deployedAt: "2026-09-04T09:36:00.000Z", revision: "3909da1" }],
    },
  },
  {
    metadata: { name: "shop-production", labels: { app: "shop", environment: "production" } },
    spec: { destination: { namespace: "shop-production" }, source: { targetRevision: "master" } },
    status: { sync: { status: "Synced" }, health: { status: "Healthy" } },
  },
] as const

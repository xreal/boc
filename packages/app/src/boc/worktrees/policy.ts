import { bocProduct } from "@/boc/product"

export function bocWorktreeStrategy(product = bocProduct) {
  if (product !== "boc" && product !== "boc-dev") return
  return "lane" as const
}

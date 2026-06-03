// Re-exports from shared (components moved). Kept for backwards compatibility
// with owner-specific code paths (owner analytics page, sellers/[id], security/*).
export {
  AnimatedNumber,
  MiniSparkline,
  ProgressRing,
  FinancialHero,
  FinancialHeroSkeleton,
  TrendChart,
  TrendChartSkeleton,
  OrderFunnel,
  OrderFunnelSkeleton,
  ProductMatrix,
  ProductMatrixSkeleton,
  ClientAnalytics,
  ClientAnalyticsSkeleton,
  DayHeatmap,
  ForecastCard,
  SalesChart,
  SalesChartSkeleton,
  StatsGrid,
  StatsGridSkeleton,
  TopProductsList,
  TopClientsList,
  TopListSkeleton,
} from "@/components/shared/analytics";

// Owner-only narrative/insights components
export { OwnerInsights, OwnerInsightsSkeleton } from "./owner-insights";
export { StrategySection, StrategySectionSkeleton } from "./strategy-section";
export { FinanceSummaryCard, FinanceSummaryCardSkeleton } from "./finance-summary-card";

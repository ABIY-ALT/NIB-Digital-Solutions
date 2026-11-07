/** AppCore charts — pure SVG, theme-aware, accessible (sr-only data tables), no chart library. */
export { BarChart, type BarChartProps } from './bar-chart';
export { ChartDataTable, ChartLegend, ChartTooltip } from './chart-parts';
export {
  CHART_COLORS,
  colorAt,
  compactNumber,
  niceTicks,
  useElementWidth,
  type ChartSeries,
  type ValueFormatter,
} from './chart-utils';
export { DonutChart, type DonutSlice } from './donut-chart';
export { Heatmap, RadialProgress, SemiGauge, semiPoint, Sparkline } from './gauges';
export { layoutMiniBars, MiniBars, type MiniBar } from './mini-bars';
export { monotonePath, TrendChart, type TrendChartProps } from './trend-chart';
export {
  BulletChart,
  FunnelChart,
  funnelConversions,
  StackedBar,
  type BulletItem,
  type FunnelStage,
  type StackedSegment,
} from './comparison';
export { RadarChart, radarPoint } from './radar-chart';
export { layoutWaterfall, WaterfallChart, type WaterfallStep } from './waterfall-chart';

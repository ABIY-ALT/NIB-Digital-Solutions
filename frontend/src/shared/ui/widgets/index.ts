/** AppCore dashboard widgets — data-driven, theme-aware, presentational. */
export { KpiCard, type KpiCardProps } from './kpi-card';
export {
  MeterList,
  RankedList,
  SegmentedControl,
  StatusTracker,
  Timeline,
  type MeterItem,
  type RankedItem,
  type TimelineItem,
  type TrackerStep,
} from './lists';
export { Carousel, type CarouselLabels } from './carousel';
export { MiniCalendar, monthGrid, type CalendarEvent } from './mini-calendar';
export { QuickActions, type QuickAction } from './quick-actions';
export { formatDuration, TaskList, type TaskItem, type TaskListLabels } from './task-list';
export { CompactTable, type CompactColumn } from './compact-table';
export { DeltaBadge, deltaDirection, relativeChange, type DeltaDirection } from './delta';
export { EntityList, type EntityListItem } from './entity-list';
export { HeroCard, heroActionClass } from './hero-card';
export { clampRatio, ProgressBar } from './progress-bar';
export { IconTile, StatGrid, type StatGridItem } from './stat-grid';
export { TONE_COLOR, TONE_FILL, TONE_SOFT, type WidgetTone } from './tones';
export { WidgetCard } from './widget-card';
export {
  HeroCardSkeleton,
  KpiCardSkeleton,
  WidgetSkeleton,
  type WidgetSkeletonSpec,
} from './widget-skeleton';

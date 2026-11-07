import type { AcademyDashboard, DashboardRange, Topic } from '../types';
import {
  PEOPLE,
  metric,
  minutesFrom,
  points,
  round,
  sampleContext,
  series,
  shares,
  sum,
} from './sample-kit';

const COURSES: ReadonlyArray<readonly [string, Topic, number]> = [
  ['Product design fundamentals', 'design', 24],
  ['Modern web development with React', 'development', 42],
  ['Financial modelling for managers', 'business', 18],
  ['SQL and data analysis', 'data', 30],
  ['Digital marketing essentials', 'marketing', 16],
  ['Business English communication', 'language', 20],
  ['Python for automation', 'development', 28],
];

export function academySample(range: DashboardRange, now: Date): AcademyDashboard {
  const ctx = sampleContext('academy', range, now);
  const { s } = ctx;
  const learners = series(ctx, 640, { growth: 0.3, weekendDip: 0.5, round: false }).map((v) =>
    ctx.granularity === 'day' ? Math.round(v) : Math.round(v / 4),
  );
  const completions = learners.map((v) => Math.round(v * s.between(0.06, 0.11)));
  const hours = Math.round(sum(learners) * s.between(0.9, 1.3));
  const goalHours = 10;

  return {
    granularity: ctx.granularity,
    learner: {
      hours: round(s.between(5.5, 9.5), 1),
      goalHours,
      streakDays: s.int(4, 21),
      completion: round(s.between(0.48, 0.78), 2),
    },
    kpis: {
      learners: metric(
        ctx,
        Math.round((sum(learners) / Math.max(1, learners.length)) * 3.2),
        0.121,
        learners,
      ),
      completions: metric(ctx, sum(completions), 0.094, completions),
      avgScore: metric(ctx, round(s.between(74, 86), 1), 0.018),
      hours: metric(ctx, hours, 0.137),
    },
    activity: points(ctx, { learners, completions }),
    weekHours: [1, 1, 1, 1, 1, 0.55, 0.4].map((w) => round(w * s.between(1.2, 3.2), 1)),
    topics: shares(
      ctx,
      [
        ['development', 32],
        ['data', 21],
        ['design', 16],
        ['business', 14],
        ['marketing', 10],
        ['language', 7],
      ],
      { scale: hours / 100 },
    ),
    instructors: PEOPLE.slice(4, 10)
      .map((name, i) => ({
        id: `I-${i + 1}`,
        name,
        topic: COURSES[i % COURSES.length]![1],
        courses: s.int(2, 9),
        students: Math.round(s.between(400, 3_800)),
        rating: round(s.between(4.2, 4.95), 1),
      }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 5),
    courses: COURSES.map(([title, topic, lessons], i) => ({
      id: `C-${101 + i}`,
      title,
      topic,
      lessons,
      learners: Math.round(s.between(180, 2_900)),
      progress: round(s.between(0.08, 0.96), 2),
      rating: round(s.between(4.1, 4.9), 1),
    })).sort((a, b) => b.learners - a.learners),
    assignments: COURSES.slice(0, 4).map(([title, topic], i) => ({
      id: `AS-${i + 1}`,
      title,
      topic,
      progress: round(s.between(0.15, 0.95), 2),
      dueAt: minutesFrom(now, (i + 1) * 60 * 24 * s.between(0.6, 2.2)),
    })),
    webinars: [
      'Designing accessible interfaces',
      'Data storytelling with dashboards',
      'Negotiation skills for team leads',
      'Cloud security basics',
    ].map((title, i) => {
      const seats = s.pick([50, 100, 150] as const);
      return {
        id: `W-${i + 1}`,
        title,
        host: PEOPLE[(i * 3 + 1) % PEOPLE.length]!,
        at: minutesFrom(now, (i + 1) * 60 * 26 + s.int(0, 300)),
        seats,
        booked: Math.round(seats * s.between(0.35, 0.98)),
      };
    }),
  };
}

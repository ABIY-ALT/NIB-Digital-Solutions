'use client';

import { memo } from 'react';
import { cn } from '@/shared/lib/cn';
import { iconFor } from '../../icons';
import type { MarketplaceProduct as Product, ScreenVariant } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Branded UI previews, rendered from each product's own labels and accent
// colour. Used wherever a real screenshot hasn't been uploaded yet. All sizes
// are in `em` and the root font-size follows the container width (cqw), so a
// preview looks identical in a 300px card and a full-screen player.
// ─────────────────────────────────────────────────────────────────────────────

export function tint(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function series(seed: string, count: number, min = 0.25, max = 1) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const trend = i / count / 2.5;
    out.push(Math.min(max, min + (h / 4294967296) * (max - min) * 0.75 + trend));
  }
  return out;
}

const STATUS = [
  { label: 'Active', bg: '#E7F6EF', fg: '#0F7A50' },
  { label: 'Pending', bg: '#FFF4D6', fg: '#8A5A00' },
  { label: 'Paid', bg: '#E6F0FD', fg: '#1D5FBF' },
  { label: 'Review', bg: '#F1ECFE', fg: '#5B3CC4' },
];

const shortName = (p: Product) => p.name.split(/ [–-] /)[0];

function Frame({ children, slug }: { children: React.ReactNode; slug: string }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[0.9em] bg-white ring-1 ring-black/5">
      <div className="flex h-[2.1em] shrink-0 items-center gap-[0.4em] border-b border-slate-100 bg-slate-50 px-[0.9em]">
        <span className="h-[0.6em] w-[0.6em] rounded-full bg-[#FF6159]" />
        <span className="h-[0.6em] w-[0.6em] rounded-full bg-[#FFBD2E]" />
        <span className="h-[0.6em] w-[0.6em] rounded-full bg-[#28C941]" />
        <span className="mx-auto flex h-[1.3em] w-[45%] items-center justify-center rounded-full bg-white px-[0.8em] text-[0.72em] text-slate-400 ring-1 ring-slate-200">
          solutions.nibbanksc.com/{slug.split('-')[0]}
        </span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function Sidebar({ p }: { p: Product }) {
  const Icon = iconFor(p.icon);
  return (
    <aside className="flex w-[12%] shrink-0 flex-col items-center gap-[0.9em] bg-[#3D2312] py-[1em]">
      <span
        className="flex h-[2.2em] w-[2.2em] items-center justify-center rounded-[0.6em]"
        style={{ background: p.accent }}
      >
        <Icon className="h-[1.2em] w-[1.2em] text-white" />
      </span>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-[1.6em] w-[1.6em] rounded-[0.45em]"
          style={{ background: i === 0 ? tint('#FEB914', 0.9) : 'rgba(255,255,255,0.1)' }}
        />
      ))}
    </aside>
  );
}

function Kpis({ p }: { p: Product }) {
  const trends = ['+12.4%', '+8.1%', '+3.2%'];
  return (
    <div className="grid grid-cols-3 gap-[0.8em]">
      {p.content.screenLabels.kpis.slice(0, 3).map(({ label, value }, i) => (
        <div key={label} className="rounded-[0.7em] bg-white p-[0.8em] ring-1 ring-slate-200/70">
          <div className="text-[0.72em] text-slate-500">{label}</div>
          <div className="mt-[0.2em] text-[1.25em] font-bold text-[#3D2312]">{value}</div>
          <div className="mt-[0.2em] text-[0.68em] font-semibold text-emerald-600">
            {trends[i]} this month
          </div>
        </div>
      ))}
    </div>
  );
}

function Bars({ p, count = 12 }: { p: Product; count?: number }) {
  const values = series(p.slug, count);
  return (
    <div className="flex h-full items-end gap-[0.45em]">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[0.3em]"
          style={{
            height: `${v * 100}%`,
            background: i === values.length - 1 ? p.accent : tint(p.accent, 0.28),
          }}
        />
      ))}
    </div>
  );
}

function Rows({
  p,
  count = 4,
  amounts = false,
}: {
  p: Product;
  count?: number;
  amounts?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[0.55em]">
      {Array.from({ length: count }, (_, i) => {
        const s = STATUS[(i + p.slug.length) % STATUS.length]!;
        const label =
          p.content.screenLabels.rows[i % p.content.screenLabels.rows.length] ?? `Record ${i + 1}`;
        return (
          <div key={i} className="flex items-center gap-[0.6em]">
            <span
              className="h-[1.8em] w-[1.8em] shrink-0 rounded-full"
              style={{ background: tint(p.accent, 0.15 + (i % 3) * 0.08) }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.78em] font-semibold text-slate-800">{label}</div>
              <div className="mt-[0.25em] h-[0.4em] w-[55%] rounded-full bg-slate-100" />
            </div>
            {amounts && (
              <span className="text-[0.72em] font-semibold text-slate-700">
                {(12 + i * 7.3).toFixed(1)}K
              </span>
            )}
            <span
              className="rounded-full px-[0.6em] py-[0.15em] text-[0.66em] font-semibold"
              style={{ background: s.bg, color: s.fg }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ p }: { p: Product }) {
  return (
    <Frame slug={p.slug}>
      <div className="flex h-full">
        <Sidebar p={p} />
        <main className="flex min-w-0 flex-1 flex-col gap-[0.9em] bg-[#F6F8FC] p-[1.1em]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[1.1em] font-bold text-[#3D2312]">{shortName(p)}</div>
              <div className="text-[0.72em] text-slate-500">Overview · Today</div>
            </div>
            <div className="flex items-center gap-[0.5em]">
              <span className="h-[1.8em] w-[8em] rounded-full bg-white ring-1 ring-slate-200" />
              <span className="h-[1.8em] w-[1.8em] rounded-full bg-[#FEB914]" />
            </div>
          </div>
          <Kpis p={p} />
          <div className="grid min-h-0 flex-1 grid-cols-5 gap-[0.8em]">
            <div className="col-span-3 flex min-h-0 flex-col rounded-[0.7em] bg-white p-[0.9em] ring-1 ring-slate-200/70">
              <div className="mb-[0.6em] flex items-center justify-between">
                <span className="text-[0.8em] font-semibold text-slate-700">Monthly trend</span>
                <span className="rounded-full bg-slate-100 px-[0.6em] text-[0.65em] text-slate-500">
                  12 months
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <Bars p={p} />
              </div>
            </div>
            <div className="col-span-2 overflow-hidden rounded-[0.7em] bg-white p-[0.9em] ring-1 ring-slate-200/70">
              <div className="mb-[0.7em] text-[0.8em] font-semibold text-slate-700">
                Recent activity
              </div>
              <Rows p={p} count={4} />
            </div>
          </div>
        </main>
      </div>
    </Frame>
  );
}

function Table({ p }: { p: Product }) {
  return (
    <Frame slug={p.slug}>
      <div className="flex h-full">
        <Sidebar p={p} />
        <main className="flex min-w-0 flex-1 flex-col gap-[0.8em] bg-[#F6F8FC] p-[1.1em]">
          <div className="flex items-center justify-between">
            <div className="text-[1.05em] font-bold text-[#3D2312]">
              {p.content.modules[0]?.name ?? 'Records'}
            </div>
            <span
              className="rounded-[0.5em] px-[0.8em] py-[0.35em] text-[0.7em] font-semibold text-white"
              style={{ background: p.accent }}
            >
              + New
            </span>
          </div>
          <div className="flex gap-[0.5em]">
            <span className="h-[1.9em] flex-1 rounded-[0.5em] bg-white ring-1 ring-slate-200" />
            {['All', 'Active', 'Pending'].map((f, i) => (
              <span
                key={f}
                className={cn(
                  'flex items-center rounded-[0.5em] px-[0.8em] text-[0.7em] font-medium',
                  i === 0
                    ? 'bg-[#3D2312] text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200',
                )}
              >
                {f}
              </span>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-[0.7em] bg-white ring-1 ring-slate-200/70">
            <div className="grid grid-cols-[2.2fr_1fr_1fr_1fr] border-b border-slate-100 bg-slate-50 px-[0.9em] py-[0.55em] text-[0.66em] font-semibold tracking-wide text-slate-500 uppercase">
              <span>Name</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Updated</span>
            </div>
            {Array.from({ length: 6 }, (_, i) => {
              const s = STATUS[(i * 3 + p.name.length) % STATUS.length]!;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[2.2fr_1fr_1fr_1fr] items-center border-b border-slate-50 px-[0.9em] py-[0.6em] text-[0.74em]"
                >
                  <span className="flex items-center gap-[0.5em] truncate font-medium text-slate-800">
                    <span
                      className="h-[1.4em] w-[1.4em] shrink-0 rounded-full"
                      style={{ background: tint(p.accent, 0.2) }}
                    />
                    <span className="truncate">
                      {p.content.screenLabels.rows[i % p.content.screenLabels.rows.length]}
                    </span>
                  </span>
                  <span>
                    <span
                      className="rounded-full px-[0.6em] py-[0.1em] text-[0.88em] font-semibold"
                      style={{ background: s.bg, color: s.fg }}
                    >
                      {s.label}
                    </span>
                  </span>
                  <span className="text-slate-600">ETB {(4.2 + i * 1.7).toFixed(1)}K</span>
                  <span className="text-slate-400">{i + 1}h ago</span>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </Frame>
  );
}

function Phone({ p }: { p: Product }) {
  const Icon = iconFor(p.icon);
  const { label, value } = p.content.screenLabels.kpis[0] ?? { label: 'Balance', value: '—' };
  return (
    <div
      className="relative mx-auto h-full rounded-[2.2em] bg-[#3D2312] p-[0.45em] shadow-2xl"
      style={{ aspectRatio: '9 / 18.5' }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[1.8em] bg-[#F6F8FC]">
        <div className="flex items-center justify-between px-[1.1em] pt-[0.7em] text-[0.62em] font-semibold text-slate-700">
          <span>9:41</span>
          <span className="h-[1.1em] w-[4.5em] rounded-full bg-[#3D2312]" />
          <span>100%</span>
        </div>
        <div className="flex items-center gap-[0.5em] px-[1em] pt-[0.9em]">
          <span
            className="flex h-[2em] w-[2em] items-center justify-center rounded-[0.6em]"
            style={{ background: tint(p.accent, 0.15) }}
          >
            <Icon className="h-[1.1em] w-[1.1em]" style={{ color: p.accent }} />
          </span>
          <span className="text-[0.95em] font-bold text-[#3D2312]">
            {p.content.screenLabels.mobileTitle}
          </span>
        </div>
        <div
          className="mx-[0.9em] mt-[0.8em] rounded-[1em] p-[0.9em] text-white"
          style={{ background: p.accent }}
        >
          <div className="text-[0.66em] opacity-85">{label}</div>
          <div className="text-[1.35em] font-bold">{value}</div>
          <div className="mt-[0.5em] flex gap-[0.35em]">
            <span className="rounded-full bg-white/25 px-[0.6em] py-[0.15em] text-[0.58em] font-semibold">
              Pay
            </span>
            <span className="rounded-full bg-white/25 px-[0.6em] py-[0.15em] text-[0.58em] font-semibold">
              Details
            </span>
          </div>
        </div>
        <div className="mx-[0.9em] mt-[0.8em] grid grid-cols-4 gap-[0.4em]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-[0.25em]">
              <span className="h-[2.1em] w-[2.1em] rounded-[0.7em] bg-white ring-1 ring-slate-200" />
              <span className="h-[0.35em] w-[70%] rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="mx-[0.9em] mt-[0.9em] flex-1 overflow-hidden rounded-[0.9em] bg-white p-[0.8em] ring-1 ring-slate-200/70">
          <div className="mb-[0.6em] text-[0.7em] font-semibold text-slate-700">Recent</div>
          <Rows p={p} count={4} />
        </div>
        <div className="flex justify-around px-[1em] py-[0.7em]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-[1.2em] w-[1.2em] rounded-[0.35em]"
              style={{ background: i === 0 ? p.accent : '#D7DCE6' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Mobile({ p }: { p: Product }) {
  return (
    <div className="flex h-full items-center justify-center gap-[2.5em] overflow-hidden rounded-[0.9em] bg-[#EEF2F9] py-[1.2em]">
      <div className="h-[92%]">
        <Phone p={p} />
      </div>
      <div className="hidden w-[34%] flex-col gap-[0.7em] sm:flex">
        {p.keyFeatures.map((f, i) => (
          <div
            key={f}
            className="flex items-center gap-[0.6em] rounded-[0.8em] bg-white p-[0.7em] shadow-sm ring-1 ring-slate-200/70"
            style={{ marginLeft: `${i * 1.2}em` }}
          >
            <span
              className="h-[1.8em] w-[1.8em] shrink-0 rounded-[0.5em]"
              style={{ background: tint(p.accent, 0.18) }}
            />
            <span className="text-[0.74em] leading-tight font-semibold text-slate-700">{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Form({ p }: { p: Product }) {
  const steps = ['Details', 'Documents', 'Review'];
  const fields = p.content.modules[0]?.features.slice(0, 4) ?? [
    'Name',
    'Category',
    'Amount',
    'Date',
  ];
  return (
    <Frame slug={p.slug}>
      <div className="flex h-full">
        <Sidebar p={p} />
        <main className="flex min-w-0 flex-1 flex-col gap-[0.9em] bg-[#F6F8FC] p-[1.1em]">
          <div className="text-[1.05em] font-bold text-[#3D2312]">
            New {p.content.modules[0]?.name.split(' ')[0]?.toLowerCase() ?? 'record'}
          </div>
          <div className="flex items-center gap-[0.5em]">
            {steps.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-[0.4em]">
                <span
                  className="flex h-[1.6em] w-[1.6em] items-center justify-center rounded-full text-[0.68em] font-bold"
                  style={{
                    background: i === 0 ? p.accent : '#E3E8F1',
                    color: i === 0 ? '#fff' : '#64748b',
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-[0.72em] font-medium text-slate-600">{s}</span>
                {i < steps.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-[0.8em] rounded-[0.7em] bg-white p-[1em] ring-1 ring-slate-200/70">
            {fields.map((f) => (
              <div key={f}>
                <div className="mb-[0.3em] truncate text-[0.68em] font-medium text-slate-500">
                  {f}
                </div>
                <div className="h-[2.1em] rounded-[0.5em] bg-slate-50 ring-1 ring-slate-200" />
              </div>
            ))}
            <div className="col-span-2">
              <div className="mb-[0.3em] text-[0.68em] font-medium text-slate-500">Notes</div>
              <div className="h-[3.6em] rounded-[0.5em] bg-slate-50 ring-1 ring-slate-200" />
            </div>
            <div className="col-span-2 flex justify-end gap-[0.5em]">
              <span className="rounded-[0.5em] px-[1em] py-[0.45em] text-[0.72em] font-semibold text-slate-600 ring-1 ring-slate-200">
                Save draft
              </span>
              <span
                className="rounded-[0.5em] px-[1em] py-[0.45em] text-[0.72em] font-semibold text-white"
                style={{ background: p.accent }}
              >
                Continue
              </span>
            </div>
          </div>
        </main>
      </div>
    </Frame>
  );
}

function Analytics({ p }: { p: Product }) {
  const values = series(p.slug + 'a', 14, 0.2, 0.95);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - v * 90}`).join(' ');
  const donut = [0.46, 0.31, 0.23];
  let acc = 0;
  return (
    <Frame slug={p.slug}>
      <div className="flex h-full flex-col gap-[0.8em] bg-[#F6F8FC] p-[1.1em]">
        <div className="flex items-center justify-between">
          <div className="text-[1.05em] font-bold text-[#3D2312]">{shortName(p)} · Analytics</div>
          <div className="flex gap-[0.3em]">
            {['7D', '30D', '12M'].map((r, i) => (
              <span
                key={r}
                className={cn(
                  'rounded-[0.4em] px-[0.6em] py-[0.2em] text-[0.66em] font-semibold',
                  i === 1
                    ? 'bg-[#3D2312] text-white'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200',
                )}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
        <Kpis p={p} />
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-[0.8em]">
          <div className="col-span-2 flex flex-col rounded-[0.7em] bg-white p-[0.9em] ring-1 ring-slate-200/70">
            <span className="text-[0.78em] font-semibold text-slate-700">Performance</span>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="mt-[0.5em] min-h-0 w-full flex-1"
            >
              {[25, 50, 75].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="100"
                  y1={y}
                  y2={y}
                  stroke="#EEF1F6"
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <polygon points={`0,100 ${pts} 100,100`} fill={tint(p.accent, 0.1)} />
              <polyline
                points={pts}
                fill="none"
                stroke={p.accent}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="flex flex-col items-center justify-center gap-[0.6em] rounded-[0.7em] bg-white p-[0.9em] ring-1 ring-slate-200/70">
            <svg viewBox="0 0 42 42" className="w-[62%]">
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="#EEF1F6" strokeWidth="5" />
              {donut.map((d, i) => {
                const el = (
                  <circle
                    key={i}
                    cx="21"
                    cy="21"
                    r="15.9"
                    fill="none"
                    stroke={i === 0 ? p.accent : i === 1 ? '#3D2312' : '#FEB914'}
                    strokeWidth="5"
                    strokeDasharray={`${d * 100 - 1.5} ${100 - d * 100 + 1.5}`}
                    strokeDashoffset={25 - acc * 100}
                  />
                );
                acc += d;
                return el;
              })}
            </svg>
            <div className="w-full space-y-[0.3em]">
              {p.content.screenLabels.kpis.slice(0, 3).map(({ label: l }, i) => (
                <div key={l} className="flex items-center gap-[0.4em] text-[0.64em] text-slate-600">
                  <span
                    className="h-[0.7em] w-[0.7em] rounded-full"
                    style={{ background: i === 0 ? p.accent : i === 1 ? '#3D2312' : '#FEB914' }}
                  />
                  <span className="truncate">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Calendar({ p }: { p: Product }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const blocks = series(p.slug + 'c', 9, 0, 1);
  return (
    <Frame slug={p.slug}>
      <div className="flex h-full">
        <Sidebar p={p} />
        <main className="flex min-w-0 flex-1 flex-col gap-[0.7em] bg-[#F6F8FC] p-[1.1em]">
          <div className="flex items-center justify-between">
            <div className="text-[1.05em] font-bold text-[#3D2312]">This week</div>
            <span className="text-[0.72em] text-slate-500">Nov 3 – Nov 7</span>
          </div>
          <div className="relative grid min-h-0 flex-1 grid-cols-5 gap-[0.5em]">
            {days.map((d) => (
              <div
                key={d}
                className="flex flex-col rounded-[0.6em] bg-white ring-1 ring-slate-200/70"
              >
                <div className="border-b border-slate-100 py-[0.4em] text-center text-[0.7em] font-semibold text-slate-600">
                  {d}
                </div>
              </div>
            ))}
            {blocks.map((b, i) => {
              const col = i % 5;
              const top = 14 + ((b * 62 + i * 9) % 62);
              return (
                <div
                  key={i}
                  className="absolute overflow-hidden rounded-[0.45em] border-l-[0.25em] px-[0.4em] py-[0.25em]"
                  style={{
                    left: `calc(${col * 20}% + 0.35em)`,
                    width: 'calc(20% - 1.1em)',
                    top: `${top}%`,
                    height: `${14 + (i % 3) * 5}%`,
                    background: tint(i % 3 === 2 ? '#FEB914' : p.accent, 0.14),
                    borderColor: i % 3 === 2 ? '#FEB914' : p.accent,
                  }}
                >
                  <div className="truncate text-[0.6em] font-semibold text-slate-700">
                    {p.content.screenLabels.rows[i % p.content.screenLabels.rows.length]}
                  </div>
                  <div className="text-[0.55em] text-slate-500">{9 + (i % 7)}:00</div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </Frame>
  );
}

function TicketView({ p }: { p: Product }) {
  const cells = series(p.slug + 'qr', 81, 0, 1);
  return (
    <div className="flex h-full items-center justify-center overflow-hidden rounded-[0.9em] bg-[#3D2312] p-[1.5em]">
      <div className="flex w-[82%] overflow-hidden rounded-[1.2em] bg-white shadow-2xl">
        <div className="flex-1 p-[1.4em]">
          <div className="flex items-center gap-[0.5em]">
            <span className="h-[0.7em] w-[0.7em] rounded-full" style={{ background: p.accent }} />
            <span
              className="text-[0.72em] font-semibold tracking-wider uppercase"
              style={{ color: p.accent }}
            >
              {p.name.includes('Bus') ? 'Boarding pass' : 'E-ticket'}
            </span>
          </div>
          <div className="mt-[0.6em] text-[1.4em] leading-tight font-bold text-[#3D2312]">
            {p.content.screenLabels.rows[0]}
          </div>
          <div className="mt-[1em] grid grid-cols-3 gap-[0.8em]">
            {[
              ['Date', 'Sat, 15 Nov'],
              ['Time', '07:30'],
              ['Seat', 'A-14'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[0.62em] tracking-wide text-slate-400 uppercase">{k}</div>
                <div className="text-[0.85em] font-semibold text-slate-800">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-[1em] flex items-center gap-[0.5em] rounded-[0.6em] bg-slate-50 px-[0.7em] py-[0.5em]">
            <span className="h-[1.4em] w-[1.4em] rounded-full bg-[#FEB914]" />
            <span className="text-[0.68em] text-slate-600">Paid via NIB Mobile Banking</span>
          </div>
        </div>
        <div className="relative flex w-[36%] flex-col items-center justify-center border-l-2 border-dashed border-slate-200 bg-slate-50 p-[1em]">
          <div className="grid aspect-square w-full grid-cols-9 gap-[0.12em] rounded-[0.4em] bg-white p-[0.4em] ring-1 ring-slate-200">
            {cells.map((c, i) => {
              const corner = (r: number, col: number) =>
                (r < 3 && col < 3) || (r < 3 && col > 5) || (r > 5 && col < 3);
              const r = Math.floor(i / 9);
              const col = i % 9;
              return (
                <span
                  key={i}
                  className="rounded-[0.08em]"
                  style={{ background: corner(r, col) || c > 0.55 ? '#3D2312' : 'transparent' }}
                />
              );
            })}
          </div>
          <div className="mt-[0.6em] text-[0.6em] font-semibold tracking-widest text-slate-500">
            TKT-48213
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stand-alone phone mockup (no background panel), sized by its container width. */
export function ProductPhone({ product, className }: { product: Product; className?: string }) {
  return (
    <div
      className={cn('@container aspect-[9/18.5] select-none', className)}
      role="img"
      aria-label={`${product.name} mobile app preview`}
    >
      <div className="h-full" style={{ fontSize: 'clamp(4px, 5.8cqw, 14px)' }}>
        <Phone p={product} />
      </div>
    </div>
  );
}

const VARIANTS: Record<ScreenVariant, (props: { p: Product }) => React.ReactElement> = {
  dashboard: Dashboard,
  table: Table,
  mobile: Mobile,
  form: Form,
  analytics: Analytics,
  calendar: Calendar,
  ticket: TicketView,
};

interface Props {
  product: Product;
  variant?: ScreenVariant;
  imageUrl?: string;
  className?: string;
  alt?: string;
}

export const ProductScreen = memo(function ProductScreen({
  product,
  variant = 'dashboard',
  imageUrl,
  className,
  alt,
}: Props) {
  const label = alt ?? `${product.name} ${variant} preview`;
  if (imageUrl) {
    return (
      <div className={cn('aspect-[16/10] overflow-hidden rounded-xl bg-mist', className)}>
        <img src={imageUrl} alt={label} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }
  const View = VARIANTS[variant] ?? Dashboard;
  return (
    <div
      className={cn('@container aspect-[16/10] select-none', className)}
      role="img"
      aria-label={label}
    >
      <div className="h-full w-full" style={{ fontSize: 'clamp(5px, 1.55cqw, 15px)' }}>
        <View p={product} />
      </div>
    </div>
  );
});

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { FlatWorkOrder } from '../hooks/useInnergy';
import { formatDate, dueDateLabel, urgencyColors } from '../utils';

interface Props {
  workOrders: FlatWorkOrder[];
  loading: boolean;
}

// ─── Date math ────────────────────────────────────────────────────────────────

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// ─── Scale types ──────────────────────────────────────────────────────────────

type Scale = 'day' | 'week' | '4week' | 'month';

interface ScaleConfig {
  label: string;
  dayWidth: number;       // px per day
  columnDays: number;     // days per header column (approx, for month it varies)
  headerLabel: (date: Date) => string;
  unitStart: (date: Date) => Date;
  nextUnit: (date: Date) => Date;
}

const SCALES: Record<Scale, ScaleConfig> = {
  day: {
    label: 'Day',
    dayWidth: 28,
    columnDays: 7,
    headerLabel: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    unitStart: startOfWeek,
    nextUnit: (d) => addDays(d, 7),
  },
  week: {
    label: 'Week',
    dayWidth: 14,
    columnDays: 7,
    headerLabel: (d) => `Wk ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    unitStart: startOfWeek,
    nextUnit: (d) => addDays(d, 7),
  },
  '4week': {
    label: '4 Weeks',
    dayWidth: 7,
    columnDays: 28,
    headerLabel: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    unitStart: (d) => {
      const s = startOfWeek(d);
      // round down to nearest 4-week boundary from Jan 1
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weeksSinceJan = Math.floor(diffDays(jan1, s) / 28);
      return addDays(jan1, weeksSinceJan * 28);
    },
    nextUnit: (d) => addDays(d, 28),
  },
  month: {
    label: 'Month',
    dayWidth: 4,
    columnDays: 30,
    headerLabel: (d) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    unitStart: startOfMonth,
    nextUnit: (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
  },
};

// ─── Layout constants ─────────────────────────────────────────────────────────

const ROW_HEIGHT    = 44;
const HEADER_HEIGHT = 40;
const LABEL_WIDTH   = 420;
const MIN_BAR_PX    = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkOrderTable({ workOrders, loading }: Props) {
  const [search, setSearch]   = useState('');
  const [scale, setScale]     = useState<Scale>('day');

  const labelBodyRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<HTMLDivElement>(null);
  const syncing      = useRef(false);

  const cfg = SCALES[scale];

  // ── Scroll sync ────────────────────────────────────────────────────────────
  const onChartScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (labelBodyRef.current && chartRef.current)
      labelBodyRef.current.scrollTop = chartRef.current.scrollTop;
    syncing.current = false;
  }, []);

  const onLabelScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (chartRef.current && labelBodyRef.current)
      chartRef.current.scrollTop = labelBodyRef.current.scrollTop;
    syncing.current = false;
  }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return workOrders.filter((wo) => {
      if (!q) return true;
      return (
        wo.Number?.toLowerCase().includes(q) ||
        wo.Name?.toLowerCase().includes(q) ||
        wo.projectNumber?.toLowerCase().includes(q) ||
        wo.projectName?.toLowerCase().includes(q) ||
        wo.customerName?.toLowerCase().includes(q) ||
        wo.Step?.toLowerCase().includes(q)
      );
    });
  }, [workOrders, search]);

  // ── Gantt time window ──────────────────────────────────────────────────────
  const { ganttStart, totalDays, columns } = useMemo(() => {
    const dates: Date[] = [];
    for (const wo of filtered) {
      const s = parseDate(wo.PlannedStartDate);
      const e = parseDate(wo.PlannedShipmentDate);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const padStart = scale === 'month' ? 31 : scale === '4week' ? 28 : 14;
    const padEnd   = scale === 'month' ? 62 : scale === '4week' ? 56 : 21;
    const minDays  = scale === 'month' ? 365 : scale === '4week' ? 180 : 90;

    if (dates.length === 0) {
      const start = cfg.unitStart(addDays(today, -padStart));
      return { ganttStart: start, totalDays: minDays, columns: [] as Date[] };
    }

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const start   = cfg.unitStart(addDays(minDate, -padStart));
    const end     = addDays(maxDate, padEnd);
    const total   = Math.max(diffDays(start, end), minDays);

    // Build column markers
    const cols: Date[] = [];
    let cur = cfg.unitStart(new Date(start));
    while (diffDays(start, cur) < total) {
      cols.push(new Date(cur));
      cur = cfg.nextUnit(cur);
    }

    return { ganttStart: start, totalDays: total, columns: cols };
  }, [filtered, scale]);

  // Scroll to today when scale changes
  useEffect(() => {
    if (chartRef.current && filtered.length > 0) {
      const todayPx = diffDays(ganttStart, new Date()) * cfg.dayWidth;
      chartRef.current.scrollLeft = Math.max(0, todayPx - 200);
    }
  }, [scale, filtered.length > 0]);

  const totalWidth  = totalDays * cfg.dayWidth;
  const todayOffset = diffDays(ganttStart, new Date());

  function barColor(wo: FlatWorkOrder): string {
    switch (dueDateLabel(wo.PlannedShipmentDate).urgency) {
      case 'overdue':  return '#ef4444';
      case 'critical': return '#f97316';
      case 'soon':     return '#f59e0b';
      default:         return '#3b82f6';
    }
  }

  function columnWidth(col: Date): number {
    if (scale === 'month') return daysInMonth(col) * cfg.dayWidth;
    return cfg.columnDays * cfg.dayWidth;
  }

  return (
    <div className="gantt-outer">

      {/* ── Controls ────────────────────────────────────────────────── */}
      <div className="section-header">
        <div className="section-title-row">
          <h2 className="section-title">WORK ORDERS</h2>
          <span className="section-count">
            {loading ? '…' : `${filtered.length} open manufacturing`}
          </span>
        </div>

        {/* Scale toggle */}
        <div className="scale-toggle">
          {(Object.keys(SCALES) as Scale[]).map((s) => (
            <button
              key={s}
              className={`scale-btn ${scale === s ? 'scale-btn--active' : ''}`}
              onClick={() => setScale(s)}
            >
              {SCALES[s].label}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="search-input search-input--sm"
          placeholder="Search WO #, name, project…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="gantt-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: '#3b82f6' }} />On track</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} />{'<21d'}</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#f97316' }} />{'<7d'}</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />Overdue</span>
        </div>
      </div>

      {loading ? (
        <div className="wo-state-msg"><span className="wo-spinner" />Loading work orders…</div>
      ) : filtered.length === 0 ? (
        <div className="wo-state-msg wo-state-empty">No open manufacturing work orders found.</div>
      ) : (
        <div className="gantt-body">

          {/* ── LEFT: label panel ───────────────────────────────────── */}
          <div className="gantt-label-panel" style={{ width: LABEL_WIDTH }}>
            <div className="gantt-label-header" style={{ height: HEADER_HEIGHT }}>
              <div className="gantt-col gantt-col--wo">WO # / Name</div>
              <div className="gantt-col gantt-col--proj">Project</div>
              <div className="gantt-col gantt-col--dates">Start → Ship</div>
            </div>
            <div className="gantt-label-body" ref={labelBodyRef} onScroll={onLabelScroll}>
              {filtered.map((wo) => {
                const ship = dueDateLabel(wo.PlannedShipmentDate);
                return (
                  <div key={wo.Id} className="gantt-label-row" style={{ height: ROW_HEIGHT }}>
                    <div className="gantt-col gantt-col--wo">
                      <span className="gantt-wo-number">{wo.Number}</span>
                      <span className="gantt-wo-name" title={wo.Name}>{wo.Name}</span>
                    </div>
                    <div className="gantt-col gantt-col--proj">
                      <span className="gantt-proj-num">{wo.projectNumber}</span>
                      <span className="gantt-proj-name" title={wo.projectName}>{wo.projectName}</span>
                    </div>
                    <div className="gantt-col gantt-col--dates">
                      <span className="gantt-date-start">{formatDate(wo.PlannedStartDate)}</span>
                      <span className="gantt-date-sep">→</span>
                      <span className={`gantt-date-ship ${urgencyColors(ship.urgency)}`}>
                        {formatDate(wo.PlannedShipmentDate)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: scrollable chart ──────────────────────────────── */}
          <div className="gantt-chart-wrap" ref={chartRef} onScroll={onChartScroll}>
            <div style={{ width: totalWidth, minWidth: totalWidth, position: 'relative' }}>

              {/* Column header — sticky top, scrolls H with content */}
              <div
                className="gantt-week-header"
                style={{ height: HEADER_HEIGHT, width: totalWidth, position: 'sticky', top: 0, zIndex: 2 }}
              >
                {columns.map((col, i) => {
                  const left  = diffDays(ganttStart, col) * cfg.dayWidth;
                  const width = columnWidth(col);
                  return (
                    <div
                      key={i}
                      className="gantt-week-label"
                      style={{ left, width, height: HEADER_HEIGHT }}
                    >
                      {cfg.headerLabel(col)}
                    </div>
                  );
                })}
              </div>

              {/* Bar rows */}
              <div className="gantt-rows-area" style={{ width: totalWidth, position: 'relative' }}>

                {/* Grid lines */}
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className="gantt-grid-line"
                    style={{
                      left: diffDays(ganttStart, col) * cfg.dayWidth,
                      height: filtered.length * ROW_HEIGHT,
                    }}
                  />
                ))}

                {/* Today line */}
                {todayOffset >= 0 && todayOffset <= totalDays && (
                  <div
                    className="gantt-today-line"
                    style={{ left: todayOffset * cfg.dayWidth, height: filtered.length * ROW_HEIGHT }}
                  />
                )}

                {/* WO bars */}
                {filtered.map((wo) => {
                  const startDate = parseDate(wo.PlannedStartDate);
                  const endDate   = parseDate(wo.PlannedShipmentDate);

                  if (!startDate && !endDate) {
                    return (
                      <div key={wo.Id} className="gantt-bar-row" style={{ height: ROW_HEIGHT }}>
                        <span className="gantt-no-dates">No dates</span>
                      </div>
                    );
                  }

                  const s        = startDate ?? endDate!;
                  const e        = endDate   ?? startDate!;
                  const left     = diffDays(ganttStart, s) * cfg.dayWidth;
                  const duration = Math.max(diffDays(s, e), 1);
                  const width    = Math.max(duration * cfg.dayWidth, MIN_BAR_PX);
                  const color    = barColor(wo);
                  const durLabel = `${duration}d`;
                  // Only show text label if bar is wide enough
                  const showLabel = width >= 36;

                  return (
                    <div key={wo.Id} className="gantt-bar-row" style={{ height: ROW_HEIGHT }}>
                      <div
                        className="gantt-bar"
                        style={{ left, width, background: color }}
                        title={`${wo.Number} — ${wo.Name}\nProject: ${wo.projectName}\nStart: ${formatDate(wo.PlannedStartDate)}\nShip: ${formatDate(wo.PlannedShipmentDate)}\nDuration: ${duration} days`}
                      >
                        {showLabel && (
                          <span className="gantt-bar-label">{durLabel}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

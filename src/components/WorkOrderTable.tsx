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

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Scale types ──────────────────────────────────────────────────────────────

type Scale = 'day' | 'week' | '4week' | 'month';

interface ScaleConfig {
  label: string;
  dayWidth: number;
  columnDays: number;
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
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const s = startOfWeek(d);
      const weeks = Math.floor(diffDays(jan1, s) / 28);
      return addDays(jan1, weeks * 28);
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
const PROXY_BASE    = import.meta.env.VITE_PROXY_BASE_URL ?? '';

// ─── Drag state ───────────────────────────────────────────────────────────────

interface DragState {
  woId: string;
  woIndex: number;
  startDayOffset: number;    // gantt day where bar starts
  endDayOffset: number;      // gantt day where bar ends
  duration: number;          // days (end - start)
  dragStartX: number;        // mouse X when drag began
  currentDeltaDays: number;  // live delta while dragging
}

// ─── Save status per WO ───────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkOrderTable({ workOrders, loading }: Props) {
  const [search, setSearch]       = useState('');
  const [scale, setScale]         = useState<Scale>('day');
  const [drag, setDrag]           = useState<DragState | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [localDates, setLocalDates] = useState<Record<string, { start: string | null; end: string | null }>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    woId: string;
    woName: string;
    oldDate: string;
    newDate: string;
    newStartDate: string;
    deltaDays: number;
  } | null>(null);

  const labelBodyRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<HTMLDivElement>(null);
  const syncing      = useRef(false);
  const cfg          = SCALES[scale];

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
      const s = parseDate(localDates[wo.Id]?.start ?? wo.PlannedStartDate);
      const e = parseDate(localDates[wo.Id]?.end   ?? wo.PlannedShipmentDate);
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

    const cols: Date[] = [];
    let cur = cfg.unitStart(new Date(start));
    while (diffDays(start, cur) < total) {
      cols.push(new Date(cur));
      cur = cfg.nextUnit(cur);
    }

    return { ganttStart: start, totalDays: total, columns: cols };
  }, [filtered, scale, localDates]);

  useEffect(() => {
    if (chartRef.current && filtered.length > 0) {
      const todayPx = diffDays(ganttStart, new Date()) * cfg.dayWidth;
      chartRef.current.scrollLeft = Math.max(0, todayPx - 200);
    }
  }, [scale, ganttStart, cfg.dayWidth]);

  const totalWidth  = totalDays * cfg.dayWidth;
  const todayOffset = diffDays(ganttStart, new Date());

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onBarMouseDown = useCallback((
    e: React.MouseEvent,
    wo: FlatWorkOrder,
    woIndex: number,
    startDayOffset: number,
    endDayOffset: number,
    duration: number
  ) => {
    e.preventDefault();
    setDrag({
      woId: wo.Id,
      woIndex,
      startDayOffset,
      endDayOffset,
      duration,
      dragStartX: e.clientX,
      currentDeltaDays: 0,
    });
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMouseMove = (e: MouseEvent) => {
      const deltaPx   = e.clientX - drag.dragStartX;
      const deltaDays = Math.round(deltaPx / cfg.dayWidth);
      setDrag((prev) => prev ? { ...prev, currentDeltaDays: deltaDays } : null);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!drag) return;

      const deltaPx   = e.clientX - drag.dragStartX;
      const deltaDays = Math.round(deltaPx / cfg.dayWidth);

      if (deltaDays === 0) {
        setDrag(null);
        return;
      }

      // Find the WO
      const wo = filtered[drag.woIndex];
      if (!wo) { setDrag(null); return; }

      const currentStart = localDates[wo.Id]?.start ?? wo.PlannedStartDate;
      const currentEnd   = localDates[wo.Id]?.end   ?? wo.PlannedShipmentDate;

      const oldEndDate   = parseDate(currentEnd);
      const oldStartDate = parseDate(currentStart);

      if (!oldEndDate) { setDrag(null); return; }

      const newEndDate   = addDays(oldEndDate,   deltaDays);
      const newStartDate = oldStartDate ? addDays(oldStartDate, deltaDays) : null;

      // Show confirmation dialog before saving
      setConfirmDialog({
        woId:         wo.Id,
        woName:       `${wo.Number} — ${wo.Name}`,
        oldDate:      formatDate(currentEnd),
        newDate:      formatDate(toISODate(newEndDate)),
        newStartDate: newStartDate ? toISODate(newStartDate) : (currentStart ?? ''),
        deltaDays,
      });

      setDrag(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [drag, cfg.dayWidth, filtered, localDates]);

  // ── Confirm and save ───────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!confirmDialog) return;
    const { woId, newDate, newStartDate, deltaDays } = confirmDialog;

    setConfirmDialog(null);

    // Find WO to get current end date for new calculation
    const wo = filtered.find((w) => w.Id === woId);
    if (!wo) return;

    const currentEnd = localDates[woId]?.end ?? wo.PlannedShipmentDate;
    const oldEnd     = parseDate(currentEnd);
    if (!oldEnd) return;

    const newEndDate = addDays(oldEnd, deltaDays);

    // Optimistic update — show new dates immediately
    setLocalDates((prev) => ({
      ...prev,
      [woId]: { start: newStartDate, end: toISODate(newEndDate) },
    }));

    setSaveStatus((prev) => ({ ...prev, [woId]: 'saving' }));

    try {
      // Build body matching exact Innergy edit schema (no Id in body - URL only)
      const editBody: Record<string, unknown> = {
        Name:                   wo.Name,
        TotalCost:              0,
        Margin:                 0,
        MarginPercentage:       0,
        TargetCriticalMilestoneDate:  toISODate(newEndDate),
        TargetCriticalStepDate:       toISODate(newEndDate),
        ActualCriticalStepDate:       toISODate(newEndDate),
        ActualCriticalMilestoneDate:  toISODate(newEndDate),
        OwnerId:                wo.Owner?.Id ?? null,
        AssigneesIds:           (wo.Assignees ?? []).map((a) => a.Id),
        DraftersIds:            [],
        EngineersIds:           [],
        TeamLeadId:             wo.TeamLead?.Id ?? null,
        Instructions:           '',
        Facility:               wo.Facility ?? '',
        Tags:                   wo.Tags ?? [],
        MaterialOnHandDays:     wo.MaterialOnHandDays ?? 0,
        ExternalIdentifier:     wo.ExternalIdentifier ?? '',
        Outsourced:             wo.Outsourced ?? false,
        IsBomRequired:          false,
      };

      const res = await fetch(`${PROXY_BASE}/proxy/workorders/${woId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editBody),
      });

      if (!res.ok) throw new Error(`API returned ${res.status}`);

      setSaveStatus((prev) => ({ ...prev, [woId]: 'saved' }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [woId]: 'idle' }));
      }, 3000);

    } catch (err) {
      console.error('Save failed:', err);
      // Revert optimistic update on failure
      setLocalDates((prev) => {
        const updated = { ...prev };
        delete updated[woId];
        return updated;
      });
      setSaveStatus((prev) => ({ ...prev, [woId]: 'error' }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [woId]: 'idle' }));
      }, 5000);
    }
  }, [confirmDialog, filtered, localDates]);

  const handleCancel = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  // ── Bar rendering helpers ──────────────────────────────────────────────────

  function barColor(wo: FlatWorkOrder): string {
    const endDate = localDates[wo.Id]?.end ?? wo.PlannedShipmentDate;
    switch (dueDateLabel(endDate).urgency) {
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

  function saveIndicator(woId: string) {
    const status = saveStatus[woId] ?? 'idle';
    if (status === 'saving') return <span className="save-indicator save-indicator--saving">↑ Saving…</span>;
    if (status === 'saved')  return <span className="save-indicator save-indicator--saved">✓ Saved</span>;
    if (status === 'error')  return <span className="save-indicator save-indicator--error">✗ Failed</span>;
    return null;
  }

  return (
    <div className="gantt-outer" style={{ userSelect: drag ? 'none' : 'auto' }}>

      {/* ── Controls ────────────────────────────────────────────────── */}
      <div className="section-header">
        <div className="section-title-row">
          <h2 className="section-title">WORK ORDERS</h2>
          <span className="section-count">
            {loading ? '…' : `${filtered.length} open manufacturing`}
          </span>
        </div>
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
          <span className="legend-item" style={{ color: 'var(--text-dim)', fontSize: 10 }}>← Drag bar to reschedule</span>
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
                const endDate   = localDates[wo.Id]?.end   ?? wo.PlannedShipmentDate;
                const startDate = localDates[wo.Id]?.start ?? wo.PlannedStartDate;
                const ship      = dueDateLabel(endDate);
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
                      <span className="gantt-date-start">{formatDate(startDate)}</span>
                      <span className="gantt-date-sep">→</span>
                      <span className={`gantt-date-ship ${urgencyColors(ship.urgency)}`}>
                        {formatDate(endDate)}
                      </span>
                      {saveIndicator(wo.Id)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: scrollable chart ──────────────────────────────── */}
          <div
            className="gantt-chart-wrap"
            ref={chartRef}
            onScroll={onChartScroll}
            style={{ cursor: drag ? 'grabbing' : 'default' }}
          >
            <div style={{ width: totalWidth, minWidth: totalWidth, position: 'relative' }}>

              {/* Sticky week header */}
              <div
                className="gantt-week-header"
                style={{ height: HEADER_HEIGHT, width: totalWidth, position: 'sticky', top: 0, zIndex: 2 }}
              >
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className="gantt-week-label"
                    style={{ left: diffDays(ganttStart, col) * cfg.dayWidth, width: columnWidth(col), height: HEADER_HEIGHT }}
                  >
                    {cfg.headerLabel(col)}
                  </div>
                ))}
              </div>

              {/* Bar rows */}
              <div className="gantt-rows-area" style={{ width: totalWidth, position: 'relative' }}>

                {/* Grid lines */}
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className="gantt-grid-line"
                    style={{ left: diffDays(ganttStart, col) * cfg.dayWidth, height: filtered.length * ROW_HEIGHT }}
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
                {filtered.map((wo, woIndex) => {
                  const rawStart = localDates[wo.Id]?.start ?? wo.PlannedStartDate;
                  const rawEnd   = localDates[wo.Id]?.end   ?? wo.PlannedShipmentDate;

                  const startDate = parseDate(rawStart);
                  const endDate   = parseDate(rawEnd);

                  if (!startDate && !endDate) {
                    return (
                      <div key={wo.Id} className="gantt-bar-row" style={{ height: ROW_HEIGHT }}>
                        <span className="gantt-no-dates">No dates</span>
                      </div>
                    );
                  }

                  const s          = startDate ?? endDate!;
                  const e          = endDate   ?? startDate!;
                  const startOff   = diffDays(ganttStart, s);
                  const endOff     = diffDays(ganttStart, e);
                  const duration   = Math.max(diffDays(s, e), 1);

                  // Apply live drag delta
                  const isDragging = drag?.woId === wo.Id;
                  const delta      = isDragging ? drag!.currentDeltaDays : 0;
                  const left       = (startOff + delta) * cfg.dayWidth;
                  const width      = Math.max(duration * cfg.dayWidth, MIN_BAR_PX);
                  const color      = barColor(wo);
                  const durLabel   = `${duration}d`;
                  const showLabel  = width >= 36;

                  return (
                    <div key={wo.Id} className="gantt-bar-row" style={{ height: ROW_HEIGHT }}>
                      <div
                        className={`gantt-bar ${isDragging ? 'gantt-bar--dragging' : ''}`}
                        style={{ left, width, background: color, transition: isDragging ? 'none' : 'left 0.15s ease' }}
                        onMouseDown={(e) => onBarMouseDown(e, wo, woIndex, startOff, endOff, duration)}
                        title={`${wo.Number} — ${wo.Name}\nProject: ${wo.projectName}\nStart: ${formatDate(rawStart)}\nShip: ${formatDate(rawEnd)}\nDuration: ${duration} days\n\nDrag to reschedule ship date`}
                      >
                        {showLabel && <span className="gantt-bar-label">{durLabel}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── Confirm dialog ──────────────────────────────────────────── */}
      {confirmDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-title">Confirm Reschedule</div>
            <div className="dialog-body">
              <div className="dialog-wo-name">{confirmDialog.woName}</div>
              <div className="dialog-change">
                <div className="dialog-change-row">
                  <span className="dialog-change-label">Ship date was</span>
                  <span className="dialog-change-old">{confirmDialog.oldDate}</span>
                </div>
                <div className="dialog-arrow">↓</div>
                <div className="dialog-change-row">
                  <span className="dialog-change-label">Ship date will be</span>
                  <span className="dialog-change-new">{confirmDialog.newDate}</span>
                </div>
              </div>
              <div className="dialog-note">
                This will update <code>ActualCriticalStepDate</code> in Innergy.
                The shift is <strong>{confirmDialog.deltaDays > 0 ? '+' : ''}{confirmDialog.deltaDays} days</strong>.
              </div>
            </div>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn--cancel" onClick={handleCancel}>
                Cancel
              </button>
              <button className="dialog-btn dialog-btn--confirm" onClick={handleConfirm}>
                Confirm &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

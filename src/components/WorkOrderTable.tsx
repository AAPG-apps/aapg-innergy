import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { FlatWorkOrder } from '../hooks/useInnergy';
import { formatDate, dueDateLabel, urgencyColors } from '../utils';

interface Props {
  workOrders: FlatWorkOrder[];
  loading: boolean;
  onFilteredCountChange?: (count: number) => void;
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
    label: 'Day', dayWidth: 28, columnDays: 7,
    headerLabel: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    unitStart: startOfWeek,
    nextUnit: (d) => addDays(d, 7),
  },
  week: {
    label: 'Week', dayWidth: 14, columnDays: 7,
    headerLabel: (d) => `Wk ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    unitStart: startOfWeek,
    nextUnit: (d) => addDays(d, 7),
  },
  '4week': {
    label: '4 Weeks', dayWidth: 7, columnDays: 28,
    headerLabel: (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    unitStart: (d) => {
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const s = startOfWeek(d);
      return addDays(jan1, Math.floor(diffDays(jan1, s) / 28) * 28);
    },
    nextUnit: (d) => addDays(d, 28),
  },
  month: {
    label: 'Month', dayWidth: 4, columnDays: 30,
    headerLabel: (d) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    unitStart: startOfMonth,
    nextUnit: (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
  },
};

// ─── WO type definitions ──────────────────────────────────────────────────────

type WOTypeFilter = 'All' | 'Production' | 'Drafting' | 'Installation';

const WO_TYPE_OPTIONS: WOTypeFilter[] = ['All', 'Production', 'Drafting', 'Installation'];

// ─── Step definitions per type ────────────────────────────────────────────────

const PRODUCTION_STEPS = [
  { code: '3000', label: '3000 - In Drafting Process' },
  { code: '3100', label: '3100 - Ready for Engineering' },
  { code: '3110', label: '3110 - Being Engineered' },
  { code: '3130', label: '3130 - Ready for Purchasing' },
  { code: '3140', label: '3140 - Awaiting Materials' },
  { code: '3200', label: '3200 - Ready for Production' },
  { code: '3210', label: '3210 - In Production CNC' },
  { code: '3220', label: '3220 - In Production Assembly' },
  { code: '3250', label: '3250 - Production Complete' },
  { code: '3300', label: '3300 - Quality Control' },
  { code: '3310', label: '3310 - Packaging' },
  { code: '3400', label: '3400 - Staged/Ready' },
  { code: '3500', label: '3500 - Delivered' },
];

const DRAFTING_STEPS = [
  { code: '2000', label: '2000 - Awarded - Not Set Up' },
  { code: '2005', label: '2005 - Project Set Up - Not Completed' },
  { code: '2010', label: '2010 - Assigned - Not Started' },
  { code: '2020', label: '2020 - Drafting Started - Not Complete' },
  { code: '2030', label: '2030 - DM Internal Review - Not Complete' },
  { code: '2100', label: '2100 - Revise 1st Draft - Not Complete' },
  { code: '2110', label: '2110 - PM Review - Not Complete' },
  { code: '2120', label: '2120 - Revise 2nd Draft - Not Complete' },
  { code: '2130', label: '2130 - Submittal Que - Not Submitted' },
  { code: '2200', label: '2200 - Submitted - Not Returned' },
  { code: '2205', label: '2205 - Awaiting Change Orders - Not Complete' },
  { code: '2210', label: '2210 - Revisions Needed - Not Complete' },
  { code: '2220', label: '2220 - Resubmit Que - Revisions Completed' },
  { code: '2230', label: '2230 - Resubmitted - Not Returned' },
  { code: '2300', label: '2300 - Approved As Noted - Ready for Final Revisions' },
  { code: '2310', label: '2310 - Final Revisions' },
  { code: '2350', label: '2350 - Project BOM' },
  { code: '2400', label: '2400 - Closed' },
];

const INSTALLATION_STEPS = [
  { code: '4000', label: '4000 - In Production' },
  { code: '4002', label: '4002 - First Available Delivery Date' },
  { code: '4005', label: '4005 - Stored on Job Site' },
  { code: '4010', label: '4010 - Installation Start' },
  { code: '4100', label: '4100 - Being Installed' },
  { code: '4130', label: '4130 - Punch' },
  { code: '4200', label: '4200 - Install Completed' },
];

function getStepsForType(type: WOTypeFilter) {
  switch (type) {
    case 'Production':   return PRODUCTION_STEPS;
    case 'Drafting':     return DRAFTING_STEPS;
    case 'Installation': return INSTALLATION_STEPS;
    default:             return [];
  }
}

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
  startDayOffset: number;
  duration: number;
  dragStartX: number;
  currentDeltaDays: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ─── Bar color by WO type ─────────────────────────────────────────────────────

const TYPE_BASE_COLORS: Record<string, string> = {
  Production:   '#3b82f6',   // blue
  Drafting:     '#8b5cf6',   // purple
  Installation: '#10b981',   // green
};

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkOrderTable({ workOrders, loading, onFilteredCountChange }: Props) {
  const [search, setSearch]           = useState('');
  const [scale, setScale]             = useState<Scale>('day');
  const [typeFilter, setTypeFilter]   = useState<WOTypeFilter>('All');
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(new Set());
  const [stepDropdownOpen, setStepDropdownOpen] = useState(false);
  const [drag, setDrag]               = useState<DragState | null>(null);
  const [saveStatus, setSaveStatus]   = useState<Record<string, SaveStatus>>({});
  const [localDates, setLocalDates]   = useState<Record<string, { start: string | null; end: string | null }>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    woId: string; woName: string; oldDate: string;
    newDate: string; newStartDate: string; deltaDays: number;
  } | null>(null);

  const labelBodyRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<HTMLDivElement>(null);
  const syncing      = useRef(false);
  const cfg          = SCALES[scale];

  // When type filter changes, reset step selection to all steps for that type
  useEffect(() => {
    const steps = getStepsForType(typeFilter);
    setSelectedSteps(new Set(steps.map((s) => s.code)));
  }, [typeFilter]);

  const currentSteps = getStepsForType(typeFilter);
  const allStepCodes = new Set(currentSteps.map((s) => s.code));
  const showStepFilter = typeFilter !== 'All' && currentSteps.length > 0;

  // ── Scroll sync ──────────────────────────────────────────────────────────────
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

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const allStepsSelected = !showStepFilter || selectedSteps.size === allStepCodes.size;

    return workOrders.filter((wo) => {
      // Type filter
      if (typeFilter !== 'All' && wo.Type !== typeFilter) return false;

      // Text search
      const matchesSearch = !q || (
        wo.Number?.toLowerCase().includes(q) ||
        wo.Name?.toLowerCase().includes(q) ||
        wo.projectNumber?.toLowerCase().includes(q) ||
        wo.projectName?.toLowerCase().includes(q) ||
        wo.customerName?.toLowerCase().includes(q) ||
        wo.Step?.toLowerCase().includes(q)
      );

      // Step filter (only when a single type with steps is selected)
      const stepCode = wo.Step?.trim().substring(0, 4) ?? '';
      const matchesStep = allStepsSelected || selectedSteps.has(stepCode);

      return matchesSearch && matchesStep;
    });
  }, [workOrders, search, typeFilter, selectedSteps, showStepFilter, allStepCodes.size]);

  useEffect(() => {
    onFilteredCountChange?.(filtered.length);
  }, [filtered.length, onFilteredCountChange]);

  // ── Gantt time window ────────────────────────────────────────────────────────
  const { ganttStart, totalDays, columns } = useMemo(() => {
    const dates: Date[] = [];
    for (const wo of filtered) {
      const s = parseDate(localDates[wo.Id]?.start ?? wo.PlannedStartDate);
      const e = parseDate(localDates[wo.Id]?.end   ?? wo.PlannedShipmentDate);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const padStart = scale === 'month' ? 31 : scale === '4week' ? 28 : 14;
    const padEnd   = scale === 'month' ? 62 : scale === '4week' ? 56 : 21;
    const minDays  = scale === 'month' ? 365 : scale === '4week' ? 180 : 90;

    if (dates.length === 0) {
      return { ganttStart: cfg.unitStart(addDays(today, -padStart)), totalDays: minDays, columns: [] as Date[] };
    }

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const start   = cfg.unitStart(addDays(minDate, -padStart));
    const end     = addDays(maxDate, padEnd);
    const total   = Math.max(diffDays(start, end), minDays);

    const cols: Date[] = [];
    let cur = cfg.unitStart(new Date(start));
    while (diffDays(start, cur) < total) { cols.push(new Date(cur)); cur = cfg.nextUnit(cur); }

    return { ganttStart: start, totalDays: total, columns: cols };
  }, [filtered, scale, localDates, cfg]);

  useEffect(() => {
    if (chartRef.current && filtered.length > 0) {
      const todayPx = diffDays(ganttStart, new Date()) * cfg.dayWidth;
      chartRef.current.scrollLeft = Math.max(0, todayPx - 200);
    }
  }, [scale, ganttStart, cfg.dayWidth]);

  const totalWidth  = totalDays * cfg.dayWidth;
  const todayOffset = diffDays(ganttStart, new Date());

  // ── Bar color: urgency tints on top of type base color ───────────────────────
  function barColor(wo: FlatWorkOrder): string {
    const endDate = localDates[wo.Id]?.end ?? wo.PlannedShipmentDate;
    const urgency = dueDateLabel(endDate).urgency;
    if (urgency === 'overdue')  return '#ef4444';
    if (urgency === 'critical') return '#f97316';
    if (urgency === 'soon')     return '#f59e0b';
    return TYPE_BASE_COLORS[wo.Type] ?? '#3b82f6';
  }

  function columnWidth(col: Date): number {
    return scale === 'month' ? daysInMonth(col) * cfg.dayWidth : cfg.columnDays * cfg.dayWidth;
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const onBarMouseDown = useCallback((
    e: React.MouseEvent, wo: FlatWorkOrder, woIndex: number,
    startDayOffset: number, duration: number
  ) => {
    e.preventDefault();
    setDrag({ woId: wo.Id, woIndex, startDayOffset, duration, dragStartX: e.clientX, currentDeltaDays: 0 });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMouseMove = (e: MouseEvent) => {
      const deltaDays = Math.round((e.clientX - drag.dragStartX) / cfg.dayWidth);
      setDrag((prev) => prev ? { ...prev, currentDeltaDays: deltaDays } : null);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!drag) return;
      const deltaDays = Math.round((e.clientX - drag.dragStartX) / cfg.dayWidth);
      if (deltaDays === 0) { setDrag(null); return; }
      const wo = filtered[drag.woIndex];
      if (!wo) { setDrag(null); return; }
      const currentStart = localDates[wo.Id]?.start ?? wo.PlannedStartDate;
      const currentEnd   = localDates[wo.Id]?.end   ?? wo.PlannedShipmentDate;
      const oldEndDate   = parseDate(currentEnd);
      const oldStartDate = parseDate(currentStart);
      if (!oldEndDate) { setDrag(null); return; }
      const newEndDate   = addDays(oldEndDate, deltaDays);
      const newStartDate = oldStartDate ? addDays(oldStartDate, deltaDays) : null;
      setConfirmDialog({
        woId: wo.Id, woName: `${wo.Number} — ${wo.Name}`,
        oldDate: formatDate(currentEnd),
        newDate: formatDate(toISODate(newEndDate)),
        newStartDate: newStartDate ? toISODate(newStartDate) : (currentStart ?? ''),
        deltaDays,
      });
      setDrag(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [drag, cfg.dayWidth, filtered, localDates]);

  // ── Confirm save ─────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!confirmDialog) return;
    const { woId, newStartDate, deltaDays } = confirmDialog;
    setConfirmDialog(null);
    const wo = filtered.find((w) => w.Id === woId);
    if (!wo) return;
    const oldEnd = parseDate(localDates[woId]?.end ?? wo.PlannedShipmentDate);
    if (!oldEnd) return;
    const newEndDate = addDays(oldEnd, deltaDays);
    setLocalDates((prev) => ({ ...prev, [woId]: { start: newStartDate, end: toISODate(newEndDate) } }));
    setSaveStatus((prev) => ({ ...prev, [woId]: 'saving' }));
    try {
      const body = {
        Name: wo.Name, TotalCost: 0, Margin: 0, MarginPercentage: 0,
        TargetCriticalMilestoneDate: toISODate(newEndDate),
        TargetCriticalStepDate:      toISODate(newEndDate),
        ActualCriticalStepDate:      toISODate(newEndDate),
        ActualCriticalMilestoneDate: toISODate(newEndDate),
        OwnerId:      wo.Owner?.Id ?? null,
        AssigneesIds: (wo.Assignees ?? []).map((a) => a.Id),
        DraftersIds: [], EngineersIds: [],
        TeamLeadId:          wo.TeamLead?.Id ?? null,
        Instructions:        '',
        Facility:            wo.Facility ?? '',
        Tags:                wo.Tags ?? [],
        MaterialOnHandDays:  wo.MaterialOnHandDays ?? 0,
        ExternalIdentifier:  wo.ExternalIdentifier ?? '',
        Outsourced:          wo.Outsourced ?? false,
        IsBomRequired:       false,
      };
      const res = await fetch(`${PROXY_BASE}/proxy/workorders/${woId}/edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      setSaveStatus((prev) => ({ ...prev, [woId]: 'saved' }));
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [woId]: 'idle' })), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      setLocalDates((prev) => { const u = { ...prev }; delete u[woId]; return u; });
      setSaveStatus((prev) => ({ ...prev, [woId]: 'error' }));
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [woId]: 'idle' })), 5000);
    }
  }, [confirmDialog, filtered, localDates]);

  const handleCancel = useCallback(() => setConfirmDialog(null), []);

  function saveIndicator(woId: string) {
    const s = saveStatus[woId] ?? 'idle';
    if (s === 'saving') return <span className="save-indicator save-indicator--saving">↑ Saving…</span>;
    if (s === 'saved')  return <span className="save-indicator save-indicator--saved">✓ Saved</span>;
    if (s === 'error')  return <span className="save-indicator save-indicator--error">✗ Failed</span>;
    return null;
  }

  // ── Type badge color ──────────────────────────────────────────────────────────
  function typeBadgeStyle(type: string): { background: string; color: string } {
    switch (type) {
      case 'Production':   return { background: 'rgba(59,130,246,0.2)',  color: '#93c5fd' };
      case 'Drafting':     return { background: 'rgba(139,92,246,0.2)',  color: '#c4b5fd' };
      case 'Installation': return { background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' };
      default:             return { background: 'rgba(100,116,139,0.2)', color: '#94a3b8' };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="gantt-outer" style={{ userSelect: drag ? 'none' : 'auto' }}>

      {/* ── Controls ────────────────────────────────────────────────── */}
      <div className="section-header">
        <div className="section-title-row">
          <h2 className="section-title">WORK ORDERS</h2>
          <span className="section-count">
            {loading ? '…' : `${filtered.length} open`}
          </span>
        </div>

        {/* WO Type filter */}
        <div className="type-toggle">
          {WO_TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              className={`type-btn type-btn--${t.toLowerCase()} ${typeFilter === t ? 'type-btn--active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </button>
          ))}
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

        {/* Step filter — only shown for Production and Drafting */}
        {showStepFilter && (
          <div className="step-filter-wrap">
            <button
              className={`step-filter-btn ${selectedSteps.size < allStepCodes.size ? 'step-filter-btn--active' : ''}`}
              onClick={() => setStepDropdownOpen((o) => !o)}
            >
              Steps
              {selectedSteps.size < allStepCodes.size && (
                <span className="step-filter-count">{selectedSteps.size}</span>
              )}
              <span className="step-filter-chevron">{stepDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {stepDropdownOpen && (
              <div className="step-filter-dropdown">
                <div className="step-filter-actions">
                  <button className="step-action-btn" onClick={() => setSelectedSteps(new Set(allStepCodes))}>All</button>
                  <button className="step-action-btn" onClick={() => setSelectedSteps(new Set())}>None</button>
                </div>
                {currentSteps.map((s) => (
                  <label key={s.code} className="step-option">
                    <input
                      type="checkbox"
                      checked={selectedSteps.has(s.code)}
                      onChange={(e) => {
                        setSelectedSteps((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s.code); else next.delete(s.code);
                          return next;
                        });
                      }}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <input
          type="text"
          className="search-input search-input--sm"
          placeholder="Search WO #, name, project…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Legend */}
        <div className="gantt-legend">
          {typeFilter === 'All' ? (
            <>
              <span className="legend-item"><span className="legend-dot" style={{ background: TYPE_BASE_COLORS.Production }} />Production</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: TYPE_BASE_COLORS.Drafting }} />Drafting</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: TYPE_BASE_COLORS.Installation }} />Installation</span>
            </>
          ) : (
            <>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} />{'<21d'}</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#f97316' }} />{'<7d'}</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />Overdue</span>
            </>
          )}
          <span className="legend-item" style={{ color: 'var(--text-dim)', fontSize: 10 }}>← Drag to reschedule</span>
        </div>
      </div>

      {loading ? (
        <div className="wo-state-msg"><span className="wo-spinner" />Loading work orders…</div>
      ) : filtered.length === 0 ? (
        <div className="wo-state-msg wo-state-empty">No open work orders match your filters.</div>
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
                const tbStyle   = typeBadgeStyle(wo.Type);
                return (
                  <div key={wo.Id} className="gantt-label-row" style={{ height: ROW_HEIGHT }}>
                    <div className="gantt-col gantt-col--wo">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className="gantt-wo-number">{wo.Number}</span>
                        {typeFilter === 'All' && (
                          <span className="wo-type-badge" style={tbStyle}>{wo.Type}</span>
                        )}
                      </div>
                      <span className="gantt-wo-name" title={wo.Name}>{wo.Name}</span>
                    </div>
                    <div className="gantt-col gantt-col--proj">
                      <span className="gantt-proj-num">{wo.projectNumber}</span>
                      <span className="gantt-proj-name" title={wo.projectName}>{wo.projectName}</span>
                    </div>
                    <div className="gantt-col gantt-col--dates">
                      <span className="gantt-date-start">{formatDate(startDate)}</span>
                      <span className="gantt-date-sep">→</span>
                      <span className={`gantt-date-ship ${urgencyColors(ship.urgency)}`}>{formatDate(endDate)}</span>
                      {saveIndicator(wo.Id)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: chart ─────────────────────────────────────────── */}
          <div className="gantt-chart-wrap" ref={chartRef} onScroll={onChartScroll}
            style={{ cursor: drag ? 'grabbing' : 'default' }}>
            <div style={{ width: totalWidth, minWidth: totalWidth, position: 'relative' }}>

              {/* Sticky week header */}
              <div className="gantt-week-header"
                style={{ height: HEADER_HEIGHT, width: totalWidth, position: 'sticky', top: 0, zIndex: 2 }}>
                {columns.map((col, i) => (
                  <div key={i} className="gantt-week-label"
                    style={{ left: diffDays(ganttStart, col) * cfg.dayWidth, width: columnWidth(col), height: HEADER_HEIGHT }}>
                    {cfg.headerLabel(col)}
                  </div>
                ))}
              </div>

              {/* Bar rows */}
              <div className="gantt-rows-area" style={{ width: totalWidth, position: 'relative' }}>
                {columns.map((col, i) => (
                  <div key={i} className="gantt-grid-line"
                    style={{ left: diffDays(ganttStart, col) * cfg.dayWidth, height: filtered.length * ROW_HEIGHT }} />
                ))}
                {todayOffset >= 0 && todayOffset <= totalDays && (
                  <div className="gantt-today-line"
                    style={{ left: todayOffset * cfg.dayWidth, height: filtered.length * ROW_HEIGHT }} />
                )}
                {filtered.map((wo, woIndex) => {
                  const rawStart  = localDates[wo.Id]?.start ?? wo.PlannedStartDate;
                  const rawEnd    = localDates[wo.Id]?.end   ?? wo.PlannedShipmentDate;
                  const startDate = parseDate(rawStart);
                  const endDate   = parseDate(rawEnd);

                  if (!startDate && !endDate) {
                    return (
                      <div key={wo.Id} className="gantt-bar-row" style={{ height: ROW_HEIGHT }}>
                        <span className="gantt-no-dates">No dates</span>
                      </div>
                    );
                  }

                  const s         = startDate ?? endDate!;
                  const e         = endDate   ?? startDate!;
                  const startOff  = diffDays(ganttStart, s);
                  const duration  = Math.max(diffDays(s, e), 1);
                  const isDragging = drag?.woId === wo.Id;
                  const delta     = isDragging ? drag!.currentDeltaDays : 0;
                  const left      = (startOff + delta) * cfg.dayWidth;
                  const width     = Math.max(duration * cfg.dayWidth, MIN_BAR_PX);
                  const color     = barColor(wo);
                  const showLabel = width >= 36;

                  return (
                    <div key={wo.Id} className="gantt-bar-row" style={{ height: ROW_HEIGHT }}>
                      <div
                        className={`gantt-bar ${isDragging ? 'gantt-bar--dragging' : ''}`}
                        style={{ left, width, background: color, transition: isDragging ? 'none' : 'left 0.15s ease' }}
                        onMouseDown={(ev) => onBarMouseDown(ev, wo, woIndex, startOff, duration)}
                        title={`${wo.Number} — ${wo.Name}\nType: ${wo.Type}\nProject: ${wo.projectName}\nStart: ${formatDate(rawStart)}\nShip: ${formatDate(rawEnd)}\nDuration: ${duration} days`}
                      >
                        {showLabel && <span className="gantt-bar-label">{duration}d</span>}
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
                The shift is <strong>{confirmDialog.deltaDays > 0 ? '+' : ''}{confirmDialog.deltaDays} days</strong>.
                This will update <code>ActualCriticalStepDate</code> in Innergy.
              </div>
            </div>
            <div className="dialog-actions">
              <button className="dialog-btn dialog-btn--cancel" onClick={handleCancel}>Cancel</button>
              <button className="dialog-btn dialog-btn--confirm" onClick={handleConfirm}>Confirm &amp; Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

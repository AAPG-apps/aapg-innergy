import { useState, useMemo } from 'react';
import type { ProjectWithWorkOrders } from '../types/innergy';
import { formatDate, categorizeStatus, statusColors, dueDateLabel, urgencyColors } from '../utils';

interface Props {
  projects: ProjectWithWorkOrders[];
  selectedId: string | null;
  onSelect: (project: ProjectWithWorkOrders) => void;
}

export function ProjectList({ projects, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Collect unique statuses for filter dropdown
  const uniqueStatuses = useMemo(() => {
    const set = new Set(projects.map((p) => p.Status ?? 'Unknown'));
    return ['ALL', ...Array.from(set).sort()];
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const matchesSearch =
        !q ||
        p.Number?.toLowerCase().includes(q) ||
        p.Name?.toLowerCase().includes(q) ||
        p.Customer?.Name?.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'ALL' || p.Status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  return (
    <div className="project-list">
      {/* Controls */}
      <div className="list-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search project #, name, or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {uniqueStatuses.map((s) => (
            <option key={s} value={s}>
              {s === 'ALL' ? 'All Statuses' : s}
            </option>
          ))}
        </select>
      </div>

      <div className="list-count">
        {filtered.length} of {projects.length} projects
      </div>

      {/* Project rows */}
      <div className="project-rows">
        {filtered.map((project) => {
          const cat = categorizeStatus(project.Status);
          const sc = statusColors(cat);
          const due = dueDateLabel(project.SubstantialCompletion);
          const isSelected = project.Id === selectedId;

          const hasOpenWOs =
            project.workOrdersLoaded && project.workOrders.length > 0;
          const hasImpediments =
            project.workOrdersLoaded &&
            project.workOrders.some((wo) => wo.Impediments?.length > 0);

          return (
            <button
              key={project.Id}
              className={`project-row ${isSelected ? 'project-row--selected' : ''}`}
              onClick={() => onSelect(project)}
            >
              {/* Left accent bar based on urgency */}
              <div className={`row-accent ${due.urgency === 'overdue' ? 'row-accent--overdue' : due.urgency === 'critical' ? 'row-accent--critical' : ''}`} />

              <div className="row-main">
                {/* Top line */}
                <div className="row-top">
                  <span className="row-number">{project.Number}</span>
                  <span className="row-name">{project.Name}</span>
                  {hasImpediments && (
                    <span className="row-flag" title="Has work order impediments">⚠</span>
                  )}
                </div>

                {/* Middle line */}
                <div className="row-mid">
                  <span className="row-customer">
                    {project.Customer?.Name ?? '—'}
                  </span>
                  {project.WorkflowStepName && (
                    <span className="row-step">{project.WorkflowStepName}</span>
                  )}
                </div>

                {/* Bottom line */}
                <div className="row-bottom">
                  <span className={`status-badge ${sc.bg} ${sc.text}`}>
                    <span className={`status-dot ${sc.dot}`} />
                    {project.Status ?? '—'}
                  </span>

                  {project.SubstantialCompletion && (
                    <span className={`row-due ${urgencyColors(due.urgency)}`}>
                      Completion: {formatDate(project.SubstantialCompletion)}
                      {(due.urgency === 'overdue' || due.urgency === 'critical') && (
                        <span className="due-badge">{due.label}</span>
                      )}
                    </span>
                  )}

                  {hasOpenWOs && (
                    <span className="row-wo-count">
                      {project.workOrders.length} production WO{project.workOrders.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="row-chevron">›</div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="list-empty">No projects match your filters.</div>
        )}
      </div>
    </div>
  );
}

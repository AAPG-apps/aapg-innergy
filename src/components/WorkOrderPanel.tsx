import React from 'react';
import type { ProjectWithWorkOrders } from '../types/innergy';
import {
  formatDate,
  dueDateLabel,
  categorizeStatus,
  statusColors,
  urgencyColors,
} from '../utils';

interface Props {
  project: ProjectWithWorkOrders;
  onClose: () => void;
}

export function WorkOrderPanel({ project, onClose }: Props) {
  const { workOrders, workOrdersLoading, workOrdersError, workOrdersLoaded } = project;

  return (
    <div className="wo-panel">
      {/* Header */}
      <div className="wo-panel-header">
        <div>
          <div className="wo-panel-eyebrow">Production Work Orders</div>
          <h2 className="wo-panel-title">
            <span className="wo-panel-number">{project.Number}</span>
            {project.Name}
          </h2>
          <div className="wo-panel-customer">{project.Customer?.Name ?? '—'}</div>
        </div>
        <button className="wo-close-btn" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {/* Project meta strip */}
      <div className="wo-meta-strip">
        <MetaItem label="Status" value={project.Status ?? '—'} />
        <MetaItem label="Workflow Step" value={project.WorkflowStepName ?? '—'} />
        <MetaItem label="First Delivery" value={formatDate(project.FirstDelivery)} />
        <MetaItem label="Sub. Completion" value={formatDate(project.SubstantialCompletion)} />
        <MetaItem label="Next Milestone" value={project.NextMilestone ?? '—'} />
        <MetaItem
          label="Project Manager"
          value={project.ProjectManager?.FullName ?? '—'}
        />
      </div>

      {/* Work orders */}
      <div className="wo-list-section">
        {workOrdersLoading && (
          <div className="wo-state-msg">
            <span className="wo-spinner" />
            Loading work orders…
          </div>
        )}

        {workOrdersError && (
          <div className="wo-state-error">
            Failed to load work orders: {workOrdersError}
          </div>
        )}

        {workOrdersLoaded && workOrders.length === 0 && (
          <div className="wo-state-msg wo-state-empty">
            No production work orders found for this project.
          </div>
        )}

        {workOrdersLoaded && workOrders.length > 0 && (
          <>
            <div className="wo-count-label">
              {workOrders.length} production work order{workOrders.length !== 1 ? 's' : ''}
            </div>
            <div className="wo-table-wrap">
              <table className="wo-table">
                <thead>
                  <tr>
                    <th>WO #</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Step</th>
                    <th>Planned Start</th>
                    <th>Due Date</th>
                    <th>Shipment</th>
                    <th>Facility</th>
                    <th>Team Lead</th>
                    <th>Impediments</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((wo) => {
                    const cat = categorizeStatus(wo.Status);
                    const sc = statusColors(cat);
                    const due = dueDateLabel(wo.PlannedCriticalDate);

                    return (
                      <tr key={wo.Id} className="wo-row">
                        <td className="wo-cell-number">{wo.Number}</td>
                        <td className="wo-cell-name">{wo.Name}</td>
                        <td>
                          <span className={`status-badge ${sc.bg} ${sc.text}`}>
                            <span className={`status-dot ${sc.dot}`} />
                            {wo.Status ?? '—'}
                          </span>
                        </td>
                        <td className="wo-cell-step">{wo.Step ?? '—'}</td>
                        <td>{formatDate(wo.PlannedStartDate)}</td>
                        <td>
                          <span className={urgencyColors(due.urgency)}>
                            {formatDate(wo.PlannedCriticalDate)}
                            {due.urgency !== 'none' && due.urgency !== 'ok' && (
                              <span className="due-badge">
                                {due.label}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>{formatDate(wo.PlannedShipmentDate)}</td>
                        <td>{wo.Facility ?? '—'}</td>
                        <td>{wo.TeamLead?.FullName ?? '—'}</td>
                        <td>
                          {wo.Impediments && wo.Impediments.length > 0 ? (
                            <span className="impediment-badge">
                              {wo.Impediments.length} ⚠
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-item">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{value}</div>
    </div>
  );
}

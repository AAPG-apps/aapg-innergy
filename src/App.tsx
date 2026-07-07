import React, { useState, useCallback } from 'react';
import { useInnergy } from './hooks/useInnergy';
import { ProjectList } from './components/ProjectList';
import { WorkOrderPanel } from './components/WorkOrderPanel';
import { WorkOrderTable } from './components/WorkOrderTable';
import type { ProjectWithWorkOrders } from './types/innergy';
import './index.css';

type Tab = 'projects' | 'workorders';

function App() {
  const {
    projects,
    allWorkOrders,
    projectsLoading,
    workOrdersLoading,
    projectsError,
    loadWorkOrders,
    refresh,
    lastRefreshed,
  } = useInnergy();

  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [filteredWoCount, setFilteredWoCount] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] =
    useState<ProjectWithWorkOrders | null>(null);

  const handleSelectProject = useCallback(
    async (project: ProjectWithWorkOrders) => {
      setSelectedProject(project);
      if (!project.workOrdersLoaded && !project.workOrdersLoading) {
        await loadWorkOrders(project.Id);
      }
    },
    [loadWorkOrders]
  );

  const syncedSelected = selectedProject
    ? projects.find((p) => p.Id === selectedProject.Id) ?? null
    : null;

  const handleClose = useCallback(() => setSelectedProject(null), []);

  const openCount = projects.filter((p) => p.Status === 'Open').length;
  const inProgressCount = projects.filter((p) => p.Status === 'In Progress').length;

  return (
    <div className="app">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">IN</div>
          <div>
            <div className="brand-title">Manufacturing Dashboard</div>
            <div className="brand-sub">Innergy Project & Work Order Tracker</div>
          </div>
        </div>

        <div className="topbar-stats">
          {!projectsLoading && !projectsError && (
            <>
              <Stat label="Total Projects" value={projects.length} />
              <Stat label="Open" value={openCount} highlight />
              <Stat label="In Progress" value={inProgressCount} highlight />
              <Stat label="Open Work Orders" value={filteredWoCount !== null ? filteredWoCount : allWorkOrders.length} />
            </>
          )}
        </div>

        <div className="topbar-actions">
          {lastRefreshed && (
            <span className="last-refreshed">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            className="refresh-btn"
            onClick={refresh}
            disabled={projectsLoading || workOrdersLoading}
            title="Refresh all data from Innergy"
          >
            {(projectsLoading || workOrdersLoading) ? (
              <span className="wo-spinner" />
            ) : '↻'}
            Refresh
          </button>
        </div>
      </header>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'projects' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          PROJECTS
          {!projectsLoading && (
            <span className="tab-badge">{projects.length}</span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === 'workorders' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('workorders')}
        >
          WORK ORDERS
          {!workOrdersLoading && (
            <span className="tab-badge">
              {filteredWoCount !== null && filteredWoCount !== allWorkOrders.length
                ? `${filteredWoCount} / ${allWorkOrders.length}`
                : allWorkOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <div className="tab-content">

        {/* PROJECTS tab */}
        {activeTab === 'projects' && (
          <div className="tab-pane">
            <aside className={`left-pane ${syncedSelected ? 'left-pane--narrow' : ''}`}>
              {projectsError ? (
                <div className="load-error">
                  <div className="load-error-title">Failed to load projects</div>
                  <div className="load-error-detail">{projectsError}</div>
                  <button className="refresh-btn" onClick={refresh}>Retry</button>
                </div>
              ) : projectsLoading ? (
                <div className="loading-projects">
                  <span className="wo-spinner wo-spinner--lg" />
                  <span>Loading projects from Innergy…</span>
                </div>
              ) : (
                <ProjectList
                  projects={projects}
                  selectedId={syncedSelected?.Id ?? null}
                  onSelect={handleSelectProject}
                />
              )}
            </aside>

            {syncedSelected && (
              <section className="right-pane">
                <WorkOrderPanel
                  project={syncedSelected}
                  onClose={handleClose}
                />
              </section>
            )}

            {!syncedSelected && !projectsLoading && !projectsError && projects.length > 0 && (
              <section className="right-pane right-pane--empty">
                <div className="empty-state">
                  <div className="empty-icon">◫</div>
                  <div className="empty-title">Select a project</div>
                  <div className="empty-sub">
                    Click any project to view its manufacturing work orders.
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* WORK ORDERS tab */}
        {activeTab === 'workorders' && (
          <div className="tab-pane tab-pane--full">
            <WorkOrderTable
              workOrders={allWorkOrders}
              loading={workOrdersLoading && !projectsLoading}
              onFilteredCountChange={setFilteredWoCount}
            />
          </div>
        )}

      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="topbar-stat">
      <div className={`stat-value ${highlight ? 'stat-value--highlight' : ''}`}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default App;

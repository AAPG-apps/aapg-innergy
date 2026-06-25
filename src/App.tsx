import React, { useState, useCallback } from 'react';
import { useInnergy } from './hooks/useInnergy';
import { ProjectList } from './components/ProjectList';
import { WorkOrderPanel } from './components/WorkOrderPanel';
import type { ProjectWithWorkOrders } from './types/innergy';
import './index.css';

function App() {
  const {
    projects,
    projectsLoading,
    projectsError,
    loadWorkOrders,
    refresh,
    lastRefreshed,
  } = useInnergy();

  const [selectedProject, setSelectedProject] =
    useState<ProjectWithWorkOrders | null>(null);

  const handleSelectProject = useCallback(
    async (project: ProjectWithWorkOrders) => {
      // Update selected (get latest from state)
      setSelectedProject(project);

      // Load WOs if not already loaded
      if (!project.workOrdersLoaded && !project.workOrdersLoading) {
        await loadWorkOrders(project.Id);
      }
    },
    [loadWorkOrders]
  );

  // Keep selected project in sync with projects state
  const syncedSelected = selectedProject
    ? projects.find((p) => p.Id === selectedProject.Id) ?? null
    : null;

  const handleClose = useCallback(() => setSelectedProject(null), []);

  const activeCount = projects.filter(
    (p) => p.Status?.toLowerCase().includes('active') ||
           p.Status?.toLowerCase().includes('open') ||
           p.Status?.toLowerCase().includes('progress')
  ).length;

  return (
    <div className="app">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
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
              <Stat label="Active" value={activeCount} highlight />
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
            disabled={projectsLoading}
            title="Refresh all data from Innergy"
          >
            {projectsLoading ? (
              <span className="wo-spinner" />
            ) : (
              '↻'
            )}
            Refresh
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <main className="body">
        {/* Left pane: project list */}
        <aside className={`left-pane ${syncedSelected ? 'left-pane--narrow' : ''}`}>
          {projectsError ? (
            <div className="load-error">
              <div className="load-error-title">Failed to load projects</div>
              <div className="load-error-detail">{projectsError}</div>
              <button className="refresh-btn" onClick={refresh}>
                Retry
              </button>
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

        {/* Right pane: WO detail */}
        {syncedSelected && (
          <section className="right-pane">
            <WorkOrderPanel
              project={syncedSelected}
              onClose={handleClose}
            />
          </section>
        )}

        {/* Empty state when nothing selected */}
        {!syncedSelected && !projectsLoading && !projectsError && projects.length > 0 && (
          <section className="right-pane right-pane--empty">
            <div className="empty-state">
              <div className="empty-icon">◫</div>
              <div className="empty-title">Select a project</div>
              <div className="empty-sub">
                Click any project on the left to view its production work orders
                and manufacturing schedule.
              </div>
            </div>
          </section>
        )}
      </main>
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

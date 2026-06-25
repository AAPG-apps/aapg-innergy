import { useState, useEffect, useCallback } from 'react';
import type {
  Project,
  ProjectsResponse,
  WorkOrder,
  WorkOrdersResponse,
  ProjectWithWorkOrders,
} from '../types/innergy';

// ─── Config ───────────────────────────────────────────────────────────────────
// In production: set VITE_PROXY_BASE_URL to your Worker URL
// e.g. https://innergy-proxy.YOUR-SUBDOMAIN.workers.dev
const PROXY_BASE = import.meta.env.VITE_PROXY_BASE_URL ?? '';

// ─── Raw fetch helpers ────────────────────────────────────────────────────────

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${PROXY_BASE}/proxy/projects`);
  if (!res.ok) throw new Error(`Projects fetch failed: ${res.status}`);
  const data: ProjectsResponse = await res.json();
  return data.Items ?? [];
}

async function fetchWorkOrders(projectId: string): Promise<WorkOrder[]> {
  const res = await fetch(`${PROXY_BASE}/proxy/projects/${projectId}/workOrders`);
  if (!res.ok) throw new Error(`Work orders fetch failed: ${res.status}`);
  const data: WorkOrdersResponse = await res.json();
  // Filter: production only
  return (data.Items ?? []).filter(
    (wo) => wo.Type?.toUpperCase() === 'PRODUCTION'
  );
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export interface UseInnergyReturn {
  projects: ProjectWithWorkOrders[];
  projectsLoading: boolean;
  projectsError: string | null;
  loadWorkOrders: (projectId: string) => Promise<void>;
  refresh: () => void;
  lastRefreshed: Date | null;
}

export function useInnergy(): UseInnergyReturn {
  const [projects, setProjects] = useState<ProjectWithWorkOrders[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // ── Load all projects ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProjectsLoading(true);
      setProjectsError(null);
      try {
        const raw = await fetchProjects();
        if (cancelled) return;
        const withMeta: ProjectWithWorkOrders[] = raw.map((p) => ({
          ...p,
          workOrders: [],
          workOrdersLoaded: false,
          workOrdersLoading: false,
          workOrdersError: null,
        }));
        setProjects(withMeta);
        setLastRefreshed(new Date());
      } catch (err) {
        if (!cancelled) {
          setProjectsError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshTick]);

  // ── Load work orders for one project (on demand) ───────────────────────────
  const loadWorkOrders = useCallback(async (projectId: string) => {
    // Mark loading
    setProjects((prev) =>
      prev.map((p) =>
        p.Id === projectId
          ? { ...p, workOrdersLoading: true, workOrdersError: null }
          : p
      )
    );

    try {
      const wos = await fetchWorkOrders(projectId);
      setProjects((prev) =>
        prev.map((p) =>
          p.Id === projectId
            ? {
                ...p,
                workOrders: wos,
                workOrdersLoaded: true,
                workOrdersLoading: false,
                workOrdersError: null,
              }
            : p
        )
      );
    } catch (err) {
      setProjects((prev) =>
        prev.map((p) =>
          p.Id === projectId
            ? {
                ...p,
                workOrdersLoading: false,
                workOrdersError:
                  err instanceof Error ? err.message : 'Unknown error',
              }
            : p
        )
      );
    }
  }, []);

  const refresh = useCallback(() => {
    // Reset all loaded WO state and re-fetch projects
    setProjects([]);
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    projects,
    projectsLoading,
    projectsError,
    loadWorkOrders,
    refresh,
    lastRefreshed,
  };
}

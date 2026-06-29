import { useState, useEffect, useCallback } from 'react';
import type {
  Project,
  ProjectsResponse,
  WorkOrder,
  WorkOrdersResponse,
  ProjectWithWorkOrders,
} from '../types/innergy';

// ─── Config ───────────────────────────────────────────────────────────────────
const PROXY_BASE = import.meta.env.VITE_PROXY_BASE_URL ?? '';

// ─── Raw fetch helpers ────────────────────────────────────────────────────────

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${PROXY_BASE}/proxy/projects`);
  if (!res.ok) throw new Error(`Projects fetch failed: ${res.status}`);
  const data: ProjectsResponse = await res.json();
  return (data.Items ?? []).filter(
    (p) => p.Status === 'Open' || p.Status === 'In Progress'
  );
}

async function fetchWorkOrders(projectId: string): Promise<WorkOrder[]> {
  const res = await fetch(`${PROXY_BASE}/proxy/projects/${projectId}/workOrders`);
  if (!res.ok) throw new Error(`Work orders fetch failed: ${res.status}`);
  const data: WorkOrdersResponse = await res.json();
  return (data.Items ?? []).filter(
    (wo) => wo.Type === 'Production' && wo.Status === 'Open'
  );
}

// ─── Flat WO type (includes project info for the global WO table) ─────────────

export interface FlatWorkOrder extends WorkOrder {
  projectId: string;
  projectNumber: string;
  projectName: string;
  customerName: string;
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export interface UseInnergyReturn {
  projects: ProjectWithWorkOrders[];
  allWorkOrders: FlatWorkOrder[];       // all open manufacturing WOs, sorted by shipment date
  projectsLoading: boolean;
  workOrdersLoading: boolean;
  projectsError: string | null;
  loadWorkOrders: (projectId: string) => Promise<void>;
  refresh: () => void;
  lastRefreshed: Date | null;
}

export function useInnergy(): UseInnergyReturn {
  const [projects, setProjects] = useState<ProjectWithWorkOrders[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<FlatWorkOrder[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // ── Load all projects, then auto-load all WOs ──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProjectsLoading(true);
      setProjectsError(null);
      setAllWorkOrders([]);

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
        setProjectsLoading(false);

        // Auto-load WOs for all projects in parallel
        setWorkOrdersLoading(true);
        const woResults = await Promise.allSettled(
          raw.map(async (p) => {
            const wos = await fetchWorkOrders(p.Id);
            return { project: p, wos };
          })
        );
        if (cancelled) return;

        // Build flat WO list with project info attached
        const flat: FlatWorkOrder[] = [];
        const updatedProjects: ProjectWithWorkOrders[] = withMeta.map((pm) => ({ ...pm }));

        for (const result of woResults) {
          if (result.status === 'fulfilled') {
            const { project, wos } = result.value;
            const idx = updatedProjects.findIndex((p) => p.Id === project.Id);
            if (idx !== -1) {
              updatedProjects[idx] = {
                ...updatedProjects[idx],
                workOrders: wos,
                workOrdersLoaded: true,
                workOrdersLoading: false,
              };
            }
            for (const wo of wos) {
              flat.push({
                ...wo,
                projectId: project.Id,
                projectNumber: project.Number,
                projectName: project.Name,
                customerName: project.Customer?.Name ?? '—',
              });
            }
          }
        }

        // Sort all WOs by PlannedShipmentDate ascending (nulls last)
        flat.sort((a, b) => {
          if (!a.PlannedShipmentDate && !b.PlannedShipmentDate) return 0;
          if (!a.PlannedShipmentDate) return 1;
          if (!b.PlannedShipmentDate) return -1;
          return a.PlannedShipmentDate.localeCompare(b.PlannedShipmentDate);
        });

        setProjects(updatedProjects);
        setAllWorkOrders(flat);
        setLastRefreshed(new Date());
      } catch (err) {
        if (!cancelled) {
          setProjectsError(err instanceof Error ? err.message : 'Unknown error');
          setProjectsLoading(false);
        }
      } finally {
        if (!cancelled) setWorkOrdersLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshTick]);

  // ── Load work orders for one project (on demand, for detail panel) ─────────
  const loadWorkOrders = useCallback(async (projectId: string) => {
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
            ? { ...p, workOrders: wos, workOrdersLoaded: true, workOrdersLoading: false, workOrdersError: null }
            : p
        )
      );
    } catch (err) {
      setProjects((prev) =>
        prev.map((p) =>
          p.Id === projectId
            ? { ...p, workOrdersLoading: false, workOrdersError: err instanceof Error ? err.message : 'Unknown error' }
            : p
        )
      );
    }
  }, []);

  const refresh = useCallback(() => {
    setProjects([]);
    setAllWorkOrders([]);
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    projects,
    allWorkOrders,
    projectsLoading,
    workOrdersLoading,
    projectsError,
    loadWorkOrders,
    refresh,
    lastRefreshed,
  };
}

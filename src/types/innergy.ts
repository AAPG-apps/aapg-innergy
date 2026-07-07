// ─── Shared ───────────────────────────────────────────────────────────────────

export interface NamedEntity {
  Id: string;
  FullName: string;
}

export interface MoneyValue {
  Value: number;
  OriginalValue: number;
  CurrencyCode: string;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface Project {
  Id: string;
  Number: string;
  Name: string;
  Status: string;
  Customer: { Id: string; Name: string };
  ProjectManager: NamedEntity | null;
  FirstDelivery: string | null;
  SubstantialCompletion: string | null;
  NextMilestone: string | null;
  WorkflowStepName: string | null;
  WorkflowStepIndex: number;
  CloseDate: string | null;
  Tags: string[];
}

export interface ProjectsResponse {
  Items: Project[];
}

// ─── Work Orders ──────────────────────────────────────────────────────────────

export type WorkOrderType = 'Production' | 'Drafting' | 'Installation' | string;

export interface WorkOrder {
  Id: string;
  Number: string;
  Name: string;
  Type: WorkOrderType;
  Status: string;
  Step: string;
  StepIndex: number;
  StepType: string;
  Facility: string | null;
  Outsourced: boolean;
  PlannedStartDate: string | null;
  ActualStartDate: string | null;
  PlannedCriticalDate: string | null;
  PlannedEndMonth: string | null;
  ActualEndDate: string | null;
  PlannedShipmentDate: string | null;
  ActualShipmentDate: string | null;
  Owner: NamedEntity | null;
  TeamLead: NamedEntity | null;
  Assignees: NamedEntity[];
  Impediments: string[];
  WorkflowName: string | null;
  WorkflowStepEnteredDate: string | null;
  WorkflowStepEnteredDays: number;
  MaterialOnHandDays: number;
  ExternalIdentifier: string | null;
  Tags: string[];
}

export interface WorkOrdersResponse {
  ProjectNumber: string;
  ProjectName: string;
  Items: WorkOrder[];
}

// ─── App-level derived types ───────────────────────────────────────────────────

export interface ProjectWithWorkOrders extends Project {
  workOrders: WorkOrder[];
  workOrdersLoaded: boolean;
  workOrdersLoading: boolean;
  workOrdersError: string | null;
}

export type WorkItemType = "Bug" | "Task" | "User Story" | "Feature" | "Epic";
export type WorkItemState = "New" | "Active" | "Resolved" | "Closed" | "Removed";
export type Priority = 1 | 2 | 3 | 4;

export interface WorkItem {
  id: number;
  title: string;
  type: WorkItemType;
  state: WorkItemState;
  priority: Priority;
  assignedTo: string;
  tags: string[];
  createdDate: string;
  changedDate: string;
  storyPoints?: number;
  iteration: string;
}

export interface SprintInfo {
  name: string;
  startDate: string;
  endDate: string;
  totalPoints: number;
  completedPoints: number;
  remainingPoints: number;
}

const names = ["Ana García", "Carlos López", "María Torres", "Juan Martínez", "Laura Díaz", "Pedro Sánchez"];

export const currentSprint: SprintInfo = {
  name: "Sprint 24",
  startDate: "2026-02-16",
  endDate: "2026-02-27",
  totalPoints: 42,
  completedPoints: 28,
  remainingPoints: 14,
};

export const workItems: WorkItem[] = [
  { id: 1201, title: "Error en autenticación OAuth2", type: "Bug", state: "Active", priority: 1, assignedTo: names[0], tags: ["auth", "critical"], createdDate: "2026-02-18", changedDate: "2026-02-26", storyPoints: 5, iteration: "Sprint 24" },
  { id: 1202, title: "Implementar filtros avanzados", type: "User Story", state: "Active", priority: 2, assignedTo: names[1], tags: ["search", "ux"], createdDate: "2026-02-16", changedDate: "2026-02-25", storyPoints: 8, iteration: "Sprint 24" },
  { id: 1203, title: "Optimizar consultas SQL", type: "Task", state: "Resolved", priority: 2, assignedTo: names[2], tags: ["performance", "backend"], createdDate: "2026-02-17", changedDate: "2026-02-24", storyPoints: 3, iteration: "Sprint 24" },
  { id: 1204, title: "Diseñar pantalla de reportes", type: "User Story", state: "Closed", priority: 3, assignedTo: names[3], tags: ["design", "reports"], createdDate: "2026-02-16", changedDate: "2026-02-22", storyPoints: 5, iteration: "Sprint 24" },
  { id: 1205, title: "Fix memory leak en websockets", type: "Bug", state: "New", priority: 1, assignedTo: names[4], tags: ["performance", "critical"], createdDate: "2026-02-25", changedDate: "2026-02-25", storyPoints: 3, iteration: "Sprint 24" },
  { id: 1206, title: "Migrar a TypeScript estricto", type: "Feature", state: "Active", priority: 3, assignedTo: names[5], tags: ["tech-debt"], createdDate: "2026-02-16", changedDate: "2026-02-26", storyPoints: 13, iteration: "Sprint 24" },
  { id: 1207, title: "Agregar tests unitarios API", type: "Task", state: "Closed", priority: 2, assignedTo: names[0], tags: ["testing"], createdDate: "2026-02-16", changedDate: "2026-02-20", storyPoints: 5, iteration: "Sprint 24" },
  { id: 1208, title: "Crear endpoint de exportación CSV", type: "Task", state: "Resolved", priority: 3, assignedTo: names[1], tags: ["api", "export"], createdDate: "2026-02-18", changedDate: "2026-02-24", storyPoints: 3, iteration: "Sprint 24" },
  { id: 1209, title: "Error 500 en carga de imágenes", type: "Bug", state: "Active", priority: 1, assignedTo: names[2], tags: ["upload", "critical"], createdDate: "2026-02-24", changedDate: "2026-02-26", storyPoints: 2, iteration: "Sprint 24" },
  { id: 1210, title: "Implementar notificaciones push", type: "User Story", state: "New", priority: 2, assignedTo: names[3], tags: ["notifications", "mobile"], createdDate: "2026-02-25", changedDate: "2026-02-25", storyPoints: 8, iteration: "Sprint 24" },
  { id: 1211, title: "Refactorizar módulo de pagos", type: "Feature", state: "New", priority: 2, assignedTo: names[4], tags: ["payments", "refactor"], createdDate: "2026-02-26", changedDate: "2026-02-26", storyPoints: 13, iteration: "Sprint 25" },
  { id: 1212, title: "Documentar API REST v2", type: "Task", state: "New", priority: 4, assignedTo: names[5], tags: ["docs"], createdDate: "2026-02-26", changedDate: "2026-02-26", storyPoints: 3, iteration: "Sprint 25" },
];

export const burndownData = [
  { day: "Feb 16", ideal: 42, actual: 42 },
  { day: "Feb 17", ideal: 38.5, actual: 40 },
  { day: "Feb 18", ideal: 35, actual: 37 },
  { day: "Feb 19", ideal: 31.5, actual: 34 },
  { day: "Feb 20", ideal: 28, actual: 29 },
  { day: "Feb 21", ideal: 24.5, actual: 27 },
  { day: "Feb 22", ideal: 21, actual: 22 },
  { day: "Feb 23", ideal: 17.5, actual: 20 },
  { day: "Feb 24", ideal: 14, actual: 17 },
  { day: "Feb 25", ideal: 10.5, actual: 14 },
  { day: "Feb 26", ideal: 7, actual: 14 },
  { day: "Feb 27", ideal: 0, actual: null },
];

export const velocityData = [
  { sprint: "Sprint 19", completed: 34, committed: 40 },
  { sprint: "Sprint 20", completed: 38, committed: 38 },
  { sprint: "Sprint 21", completed: 29, committed: 35 },
  { sprint: "Sprint 22", completed: 42, committed: 45 },
  { sprint: "Sprint 23", completed: 36, committed: 40 },
  { sprint: "Sprint 24", completed: 28, committed: 42 },
];

import {
  WorkItemRaw,
  parseAllWorkItems,
  getLastUpdated,
  getSimulatedCreatedDate,
  getSprintKey,
  getSprintDates,
  getTeamFromAreaPath,
  getAllSprints,
  parseFeatureSnapshots,
  FeatureSnapshotRow,
} from './csvParser';

const NOW = new Date('2026-02-27');

export const DONE_STATES = ['Closed', 'Resolved', 'Removed'] as const;
export const ACTIVE_STATES = ['Active', 'Impediment', 'Paused', 'Staging', 'Production'] as const;
export const TODO_STATES = ['New', 'Ready', 'Ready For Refinement', 'Refinement', 'Design'] as const;

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function inState(state: string, states: readonly string[]) {
  return states.includes(state);
}

// ---------- DATA SETUP ----------
const allItems = parseAllWorkItems();
const featureSnapshots = parseFeatureSnapshots();

const features = allItems.filter(i => i.type === 'Feature');
const userStories = allItems.filter(i =>
  i.type === 'User Story' || i.type === 'Enabler Story'
);
const tasks = allItems.filter(i => i.type === 'Task');
const allChildren = [...userStories, ...tasks, ...allItems.filter(i => i.type === 'Bug' || i.type === 'Spike')];

// Map children by parentId
const childrenByParent = new Map<number, WorkItemRaw[]>();
for (const item of allChildren) {
  if (item.parentId) {
    const list = childrenByParent.get(item.parentId) || [];
    list.push(item);
    childrenByParent.set(item.parentId, list);
  }
}

// Get all HU (User Stories + Enabler Stories) for a feature (recursively through hierarchy)
function getHUForFeature(featureId: number): WorkItemRaw[] {
  const direct = childrenByParent.get(featureId) || [];
  const hus = direct.filter(i => i.type === 'User Story' || i.type === 'Enabler Story');
  // Also check if feature's children have children that are HU
  const otherChildren = direct.filter(i => i.type !== 'User Story' && i.type !== 'Enabler Story');
  for (const child of otherChildren) {
    const grandChildren = childrenByParent.get(child.id) || [];
    hus.push(...grandChildren.filter(i => i.type === 'User Story' || i.type === 'Enabler Story'));
  }
  return hus;
}

function getAllHUForFeature(featureId: number): WorkItemRaw[] {
  // Direct children that are HUs
  const directChildren = childrenByParent.get(featureId) || [];
  return directChildren.filter(i =>
    i.type === 'User Story' || i.type === 'Enabler Story'
  );
}

// ---------- TYPES ----------
export type RiskLevel = 'green' | 'yellow' | 'red';

export interface FeatureAnalysis {
  id: number;
  name: string;
  status: string;
  aging: number;
  lastUpdated: Date;
  team: string;
  assignedTo: string;
  sprint: string | null;
  huTotal: number;
  huDone: number;
  huActive: number;
  huBlocked: number;
  huToDo: number;
  pctDone: number;
  pctActive: number;
  pctBlocked: number;
  pctToDo: number;
  risks: string[];
  riskLevel: RiskLevel;
}

export interface HiddenBlocker {
  featureName: string;
  featureId: number;
  huId: number;
  huTitle: string;
  daysWithoutUpdate: number;
  assignedTo: string;
  team: string;
}

export interface WeeklyData {
  week: string;
  value: number;
}

// ---------- FILTERS ----------
export interface DashboardFilters {
  team?: string;
  featureName?: string;
  assignee?: string;
  huType?: string;
}

function matchesFeatureFilters(f: WorkItemRaw, filters?: DashboardFilters): boolean {
  if (!filters) return true;
  if (filters.team) {
    const team = getTeamFromAreaPath(f.areaPath);
    if (team !== filters.team) return false;
  }
  if (filters.featureName && f.title !== filters.featureName) {
    return false;
  }
  return true;
}

function matchesHUFilters(hu: WorkItemRaw, filters?: DashboardFilters): boolean {
  if (!filters) return true;

  if (filters.team) {
    const team = getTeamFromAreaPath(hu.areaPath);
    if (team !== filters.team) return false;
  }

  if (filters.featureName) {
    if (!hu.parentId) return false;
    const parentFeature = features.find(f => f.id === hu.parentId);
    if (!parentFeature || parentFeature.title !== filters.featureName) {
      return false;
    }
  }

  if (filters.assignee && hu.assignedTo !== filters.assignee) {
    return false;
  }

  if (filters.huType && hu.type !== filters.huType) {
    return false;
  }

  return true;
}

function getGlobalDateRange() {
  if (!featureSnapshots.length) {
    return { start: NOW, end: NOW };
  }
  let min = featureSnapshots[0].snapshotDate;
  let max = featureSnapshots[0].snapshotDate;
  for (const s of featureSnapshots) {
    if (s.snapshotDate < min) min = s.snapshotDate;
    if (s.snapshotDate > max) max = s.snapshotDate;
  }
  return { start: min, end: max };
}

// ---------- 1. FEATURE AGING vs CLOSED HU ----------
export function getFeatureAnalyses(filters?: DashboardFilters): FeatureAnalysis[] {
  return features
    .filter(f => matchesFeatureFilters(f, filters))
    .map(f => {
    const hus = getAllHUForFeature(f.id);
    const lastUpdated = getLastUpdated(f);
    const aging = daysBetween(lastUpdated, NOW);

    const huDone = hus.filter(h => inState(h.state, DONE_STATES) && matchesHUFilters(h, filters)).length;
    const huActive = hus.filter(h => inState(h.state, ACTIVE_STATES) && matchesHUFilters(h, filters)).length;
    const huBlocked = hus.filter(h => (h.state === 'Paused' || h.state === 'Impediment') && matchesHUFilters(h, filters)).length;
    const huToDo = hus.filter(h => inState(h.state, TODO_STATES) && matchesHUFilters(h, filters)).length;
    const total = hus.length || 1;

    const risks: string[] = [];
    let riskLevel: RiskLevel = 'green';

    // Silent Risk: Feature with NO active HU
    if (huActive === 0 && !inState(f.state, DONE_STATES) && hus.length > 0) {
      risks.push('🚨 Riesgo Silencioso');
      riskLevel = 'yellow';
    }

    // Eternal 90% Syndrome
    const pctDone = (huDone / total) * 100;
    if (pctDone >= 80 && pctDone < 100 && !inState(f.state, DONE_STATES)) {
      risks.push('🚨 Síndrome del 90% Eterno');
      riskLevel = 'red';
    }

    // Many HU Done but Feature still Open
    if (huDone > 0 && !inState(f.state, DONE_STATES) && pctDone >= 60) {
      risks.push('⚠️ Convergencia fallida');
      if (riskLevel === 'green') riskLevel = 'yellow';
    }

    // High aging
    if (aging > 60 && !inState(f.state, DONE_STATES)) {
      if (riskLevel !== 'red') riskLevel = aging > 120 ? 'red' : 'yellow';
    }

    return {
      id: f.id,
      name: f.title,
      status: f.state,
      aging,
      lastUpdated,
      team: getTeamFromAreaPath(f.areaPath),
      assignedTo: f.assignedTo || 'Sin asignar',
      sprint: getSprintKey(f.iterationPath),
      huTotal: hus.length,
      huDone,
      huActive,
      huBlocked,
      huToDo,
      pctDone: Math.round((huDone / total) * 100),
      pctActive: Math.round((huActive / total) * 100),
      pctBlocked: Math.round((huBlocked / total) * 100),
      pctToDo: Math.round((huToDo / total) * 100),
      risks,
      riskLevel,
    };
  });
}

// ---------- 2. FEATURE AGING TREND ----------
export function getFeatureAgingTrend(filters?: DashboardFilters): WeeklyData[] {
  if (!featureSnapshots.length) return [];

  const teamByFeatureId = new Map<number, string>();
  const isActiveFeatureById = new Map<number, boolean>();
  for (const f of features) {
    teamByFeatureId.set(f.id, getTeamFromAreaPath(f.areaPath));
    isActiveFeatureById.set(f.id, isFeatureActiveState(f.state));
  }

  const byDate = new Map<string, { sum: number; count: number }>();

  for (const snap of featureSnapshots) {
    if (!snap.agingDays && snap.agingDays !== 0) continue;

    const team = teamByFeatureId.get(snap.featureId) || 'Unknown';
    if (!isActiveFeatureById.get(snap.featureId)) continue;
    if (filters?.team && team !== filters.team) continue;
    if (filters?.featureName && snap.featureTitle !== filters.featureName) continue;

    const key = snap.snapshotDate.toISOString().slice(0, 10);
    const agg = byDate.get(key) || { sum: 0, count: 0 };
    agg.sum += snap.agingDays;
    agg.count += 1;
    byDate.set(key, agg);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, { sum, count }]) => ({
      week: date,
      value: count ? Math.round(sum / count) : 0,
    }));
}

// ---------- 4. WIP STABILITY ----------
export function getWIPStability(filters?: DashboardFilters): WeeklyData[] {
  // Alias a la versión por snapshot/fecha para compatibilidad
  return getWIPBySprint(filters);
}

// ---------- 5. THROUGHPUT TREND ----------
export function getThroughputTrend(filters?: DashboardFilters): WeeklyData[] {
  // Alias a la versión basada en snapshots
  return getThroughputBySprint(filters);
}

// ---------- 5b. THROUGHPUT POR SPRINT (semanal/suavizado) ----------
export function getThroughputBySprint(filters?: DashboardFilters): WeeklyData[] {
  if (!featureSnapshots.length) return [];

  const teamByFeatureId = new Map<number, string>();
  const isActiveFeatureById = new Map<number, boolean>();
  for (const f of features) {
    teamByFeatureId.set(f.id, getTeamFromAreaPath(f.areaPath));
    isActiveFeatureById.set(f.id, isFeatureActiveState(f.state));
  }

  const byDate = new Map<string, number>();

  for (const snap of featureSnapshots) {
    const team = teamByFeatureId.get(snap.featureId) || 'Unknown';
    if (!isActiveFeatureById.get(snap.featureId)) continue;
    if (filters?.team && team !== filters.team) continue;
    if (filters?.featureName && snap.featureTitle !== filters.featureName) continue;

    const key = snap.snapshotDate.toISOString().slice(0, 10);
    // Consideramos "cerrada" cuando pctDone === 1
    if (snap.pctDone >= 1) {
      byDate.set(key, (byDate.get(key) || 0) + 1);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ week: date, value }));
}

// ---------- 4b. WIP POR SPRINT (tendencia semanal) ----------
export function getWIPBySprint(filters?: DashboardFilters): WeeklyData[] {
  if (!featureSnapshots.length) return [];

  const teamByFeatureId = new Map<number, string>();
  const isActiveFeatureById = new Map<number, boolean>();
  for (const f of features) {
    teamByFeatureId.set(f.id, getTeamFromAreaPath(f.areaPath));
    isActiveFeatureById.set(f.id, isFeatureActiveState(f.state));
  }

  const byDate = new Map<string, number>();

  for (const snap of featureSnapshots) {
    const team = teamByFeatureId.get(snap.featureId) || 'Unknown';
    if (!isActiveFeatureById.get(snap.featureId)) continue;
    if (filters?.team && team !== filters.team) continue;
    if (filters?.featureName && snap.featureTitle !== filters.featureName) continue;

    const key = snap.snapshotDate.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) || 0) + snap.wipHU);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ week: date, value }));
}

// ---------- 6. HIDDEN BLOCKERS ----------
export function getHiddenBlockers(filters?: DashboardFilters): HiddenBlocker[] {
  const blockers: HiddenBlocker[] = [];
  for (const hu of userStories) {
    if (inState(hu.state, ACTIVE_STATES)) {
      if (!matchesHUFilters(hu, filters)) continue;
      const lastUpdated = getLastUpdated(hu);
      const days = daysBetween(lastUpdated, NOW);
      if (days > 5) {
        // Find parent feature
        const parentFeature = features.find(f => f.id === hu.parentId);
        if (!parentFeature || !isFeatureActiveState(parentFeature.state)) continue;
        blockers.push({
          featureName: parentFeature?.title || 'Sin Feature',
          featureId: parentFeature?.id || 0,
          huId: hu.id,
          huTitle: hu.title,
          daysWithoutUpdate: days,
          assignedTo: hu.assignedTo,
          team: getTeamFromAreaPath(hu.areaPath),
        });
      }
    }
  }
  return blockers.sort((a, b) => b.daysWithoutUpdate - a.daysWithoutUpdate);
}

// ---------- KPIs ----------
export function getKPIs(filters?: DashboardFilters) {
  const analyses = getFeatureAnalyses(filters);
  const avgAging = analyses.length
    ? Math.round(analyses.filter(a => !inState(a.status, DONE_STATES)).reduce((s, a) => s + a.aging, 0) / analyses.filter(a => !inState(a.status, DONE_STATES)).length)
    : 0;

  const activeHU = userStories.filter(h =>
    inState(h.state, ACTIVE_STATES) &&
    matchesHUFilters(h, filters)
  ).length;

  // "This week" = latest sprint
  const latestSprint = getAllSprints()[getAllSprints().length - 1];
  const closedThisWeek = features.filter(f => {
    const key = getSprintKey(f.iterationPath);
    return key === latestSprint && inState(f.state, DONE_STATES);
  }).length;

  const riskFeatures = analyses.filter(a => a.riskLevel === 'red' || a.riskLevel === 'yellow').length;

  return { avgAging, activeHU, closedThisWeek, riskFeatures };
}

// ---------- FILTERS ----------
export function getUniqueTeams(): string[] {
  return [...new Set(allItems.map(i => getTeamFromAreaPath(i.areaPath)))].sort();
}

export function getUniqueSprints(): string[] {
  return getAllSprints();
}

export function getUniqueFeatureNames(): string[] {
  return features.map(f => f.title).sort();
}

export function getUniqueAssignees(): string[] {
  return [...new Set(userStories.map(h => h.assignedTo))].sort();
}

export function getUniqueHuTypes(): string[] {
  return [...new Set(userStories.map(h => h.type))].sort();
}

export interface HUDetail {
  id: number;
  title: string;
  state: string;
  type: string;
  assignedTo: string;
  aging: number;
  daysSinceUpdate: number;
  team: string;
}

export interface HUChildDetail {
  id: number;
  title: string;
  type: string;
  state: string;
  daysSinceUpdate: number;
  assignedTo: string;
  team: string;
}

export function getHUDetailsForFeature(featureId: number, filters?: DashboardFilters): HUDetail[] {
  const hus = getHUForFeature(featureId).filter(h => matchesHUFilters(h, filters));
  return hus.map(h => {
    const lastUpdated = getLastUpdated(h);
    const days = daysBetween(lastUpdated, NOW);
    return {
      id: h.id,
      title: h.title,
      state: h.state,
      type: h.type,
      assignedTo: h.assignedTo,
      aging: days,
      daysSinceUpdate: days,
      team: getTeamFromAreaPath(h.areaPath),
    };
  });
}

export function getHUChildrenDetails(huId: number): HUChildDetail[] {
  const children = (childrenByParent.get(huId) || []).filter(c => c.type === 'Task' || c.type === 'Bug');
  return children.map(c => {
    const lastUpdated = getLastUpdated(c);
    return {
      id: c.id,
      title: c.title,
      type: c.type,
      state: c.state,
      daysSinceUpdate: daysBetween(lastUpdated, NOW),
      assignedTo: c.assignedTo,
      team: getTeamFromAreaPath(c.areaPath),
    };
  });
}

export type StructureHealth = 'red' | 'yellow' | 'green';

/** Riesgo de ejecución en la tabla HU: crítico solo en estado Active; Paused/Impediment son categorías propias. */
export type HURiskCategory = 'ok' | 'critical' | 'paused' | 'impediment' | 'watch';

export interface HUExecutionAnalysis {
  huId: number;
  huTitle: string;
  huState: string;
  huType: string;
  featureId: number;
  featureName: string;
  team: string;
  sprint: string | null;
  assignedTo: string;
  tasksTotal: number;
  tasksDone: number;
  progressPct: number;
  bugsCount: number;
  bugsClosedCount: number;
  agingDays: number;
  daysWithoutUpdate: number;
  structureHealth: StructureHealth;
  /** Solo true si estado HU es Active y aplica al menos una regla crítica (alinea KPI “HU en riesgo”). */
  atRisk: boolean;
  riskCategory: HURiskCategory;
  riskReasons: string[];
}

export interface HUHealthMetrics {
  totalHU: number;
  activeHU: number;
  healthyHU: number;
  healthyPct: number;
  riskHU: number;
  staleHU: number;
  blockedHU: number;
  avgTasksPerHU: number;
  avgProgressPct: number;
  avgBugsPerHU: number;
  topRiskResponsibles: Array<{ name: string; count: number }>;
}

function getStructureHealth(tasksTotal: number): StructureHealth {
  if (tasksTotal === 0) return 'red';
  if (tasksTotal <= 2) return 'yellow';
  if (tasksTotal <= 8) return 'green';
  return 'yellow';
}

function isHUActiveState(state: string): boolean {
  return inState(state, ACTIVE_STATES);
}

function isFeatureActiveState(state: string): boolean {
  return inState(state, ACTIVE_STATES);
}

export function getHUAnalyses(filters?: DashboardFilters): HUExecutionAnalysis[] {
  const featureById = new Map<number, WorkItemRaw>();
  for (const f of features) featureById.set(f.id, f);

  const analyses: HUExecutionAnalysis[] = [];

  for (const hu of userStories) {
    if (!matchesHUFilters(hu, filters)) continue;

    const huChildren = childrenByParent.get(hu.id) || [];
    const huTasks = huChildren.filter(c => c.type === 'Task');
    const huBugs = huChildren.filter(c => c.type === 'Bug');

    const tasksTotal = huTasks.length;
    const tasksDone = huTasks.filter(t => t.state === 'Closed' || t.state === 'Done').length;
    const progressPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
    const bugsCount = huBugs.length;
    const bugsClosedCount = huBugs.filter(
      b => inState(b.state, DONE_STATES) || b.state === 'Done',
    ).length;

    const lastUpdated = getLastUpdated(hu);
    const agingDays = daysBetween(lastUpdated, NOW);
    const daysWithoutUpdate = agingDays;

    const parentFeature = hu.parentId ? featureById.get(hu.parentId) : undefined;
    const featureId = parentFeature?.id ?? 0;
    const featureName = parentFeature?.title ?? 'Sin Feature';

    const executionReasons: string[] = [];
    if (tasksTotal === 0) executionReasons.push('Sin tareas');
    if (daysWithoutUpdate > 5) executionReasons.push('Sin actualización > 5 días');
    if (agingDays > 7 && progressPct < 50) executionReasons.push('Aging > 7 días y avance < 50%');
    if (bugsCount > 3) executionReasons.push('Bugs > 3');

    let riskCategory: HURiskCategory = 'ok';
    let riskReasons: string[] = [];
    let atRisk = false;

    if (hu.state === 'Impediment') {
      riskCategory = 'impediment';
      riskReasons = ['Impedimento', ...executionReasons];
    } else if (hu.state === 'Paused') {
      riskCategory = 'paused';
      riskReasons = ['En pausa (menor riesgo)', ...executionReasons];
    } else if (hu.state === 'Active') {
      if (executionReasons.length > 0) {
        riskCategory = 'critical';
        atRisk = true;
        riskReasons = [...executionReasons];
      }
    } else if (isHUActiveState(hu.state)) {
      if (executionReasons.length > 0) {
        riskCategory = 'watch';
        riskReasons = [...executionReasons];
      }
    }

    analyses.push({
      huId: hu.id,
      huTitle: hu.title,
      huState: hu.state,
      huType: hu.type,
      featureId,
      featureName,
      team: getTeamFromAreaPath(hu.areaPath),
      sprint: getSprintKey(hu.iterationPath),
      assignedTo: hu.assignedTo,
      tasksTotal,
      tasksDone,
      progressPct,
      bugsCount,
      bugsClosedCount,
      agingDays,
      daysWithoutUpdate,
      structureHealth: getStructureHealth(tasksTotal),
      atRisk,
      riskCategory,
      riskReasons,
    });
  }

  return analyses;
}

export function getHUHealthMetrics(filters?: DashboardFilters): HUHealthMetrics {
  const hu = getHUAnalyses(filters);
  const activeHU = hu.filter(h => isHUActiveState(h.huState));
  const activeRiskHU = activeHU.filter(h => h.atRisk);
  const healthyHU = activeHU.filter(h => h.riskCategory === 'ok');

  const avgTasksPerHU = hu.length ? Math.round((hu.reduce((s, h) => s + h.tasksTotal, 0) / hu.length) * 10) / 10 : 0;
  const avgProgressPct = hu.length ? Math.round(hu.reduce((s, h) => s + h.progressPct, 0) / hu.length) : 0;
  const avgBugsPerHU = hu.length ? Math.round((hu.reduce((s, h) => s + h.bugsCount, 0) / hu.length) * 10) / 10 : 0;

  const staleHU = hu.filter(h => h.daysWithoutUpdate > 5).length;
  const blockedHU = hu.filter(h => h.huState === 'Paused' || h.huState === 'Impediment').length;

  const responsibleMap = new Map<string, number>();
  for (const h of activeRiskHU) {
    const key = h.assignedTo || 'Sin asignar';
    responsibleMap.set(key, (responsibleMap.get(key) || 0) + 1);
  }

  const topRiskResponsibles = Array.from(responsibleMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const healthyPct = activeHU.length ? Math.round((healthyHU.length / activeHU.length) * 100) : 0;

  return {
    totalHU: hu.length,
    activeHU: activeHU.length,
    healthyHU: healthyHU.length,
    healthyPct,
    riskHU: activeRiskHU.length,
    staleHU,
    blockedHU,
    avgTasksPerHU,
    avgProgressPct,
    avgBugsPerHU,
    topRiskResponsibles,
  };
}

// ---------- WIP STABILITY DETECTION ----------
export function detectWIPStability(data: WeeklyData[]): boolean {
  if (data.length < 3) return false;
  const last3 = data.slice(-3);
  const vals = last3.map(d => d.value);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return vals.every(v => Math.abs(v - avg) <= 1) && avg > 0;
}

// ---------- THROUGHPUT DROP ----------
export function detectThroughputDrop(data: WeeklyData[]): boolean {
  if (data.length < 3) return false;
  const last3 = data.slice(-3);
  return last3[0].value > last3[1].value && last3[1].value > last3[2].value;
}

// ---------- AGING TREND LOSS ----------
export function detectAgingFlowLoss(data: WeeklyData[]): boolean {
  if (data.length < 3) return false;
  const last3 = data.slice(-3);
  return last3[0].value < last3[1].value && last3[1].value < last3[2].value;
}

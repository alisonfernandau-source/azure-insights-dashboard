import { getSnapshotCsvText, getUserStoriesCsvText } from "./remoteCsv";

export interface WorkItemRaw {
  id: number;
  type: string;
  title: string;
  assignedTo: string;
  state: string;
  tags: string[];
  areaPath: string;
  iterationPath: string;
  parentId: number | null;
  /** Fecha de último cambio desde CSV (Changed Date). Si no viene o es inválida, se usa simulación por sprint. */
  changedDate: Date | null;
}

export interface FeatureSnapshotRow {
  snapshotDate: Date;
  featureId: number;
  featureTitle: string;
  huTotal: number;
  huDone: number;
  huActive: number;
  huToDo: number;
  pctDone: number;
  wipHU: number;
  blockedHU: number;
  agingDays: number | null;
  eternal90: boolean;
  noActiveHU: boolean;
}

/**
 * Parsea "Changed Date" del CSV: formato d/M/yyyy H:mm:ss
 * (ej. "27/1/2025 9:56:24", "29/7/2022 11:56:26", "27/2/2026 11:44:17").
 */
function parseChangedDate(value: string | undefined): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 1) return null;
  const datePart = parts[0];
  const timePart = parts.length >= 2 ? parts[1] : "0:0:0";
  const [d, m, y] = datePart.split("/").map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(":").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, hh, mm, ss);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Map iteration paths to approximate dates (2-week sprints)
const SPRINT_DATE_MAP: Record<string, { start: Date; end: Date }> = {
  'SPR-2025-3.3': { start: new Date('2025-01-06'), end: new Date('2025-01-19') },
  'SPR-2025-3.4': { start: new Date('2025-01-20'), end: new Date('2025-02-02') },
  'SPR-2025-3.5': { start: new Date('2025-02-03'), end: new Date('2025-02-16') },
  'SPR-2025-3.6': { start: new Date('2025-02-17'), end: new Date('2025-03-02') },
  'SPR-2025-4.1': { start: new Date('2025-03-03'), end: new Date('2025-03-16') },
  'SPR-2025-4.2': { start: new Date('2025-03-17'), end: new Date('2025-03-30') },
  'SPR-2025-4.3': { start: new Date('2025-04-01'), end: new Date('2025-04-13') },
  'SPR-2025-4.4': { start: new Date('2025-04-14'), end: new Date('2025-04-27') },
  'SPR-2025-4.5': { start: new Date('2025-04-28'), end: new Date('2025-05-11') },
  'SPR-2025-4.6': { start: new Date('2025-05-12'), end: new Date('2025-05-25') },
  'Iteration-2026-1': { start: new Date('2026-01-05'), end: new Date('2026-01-18') },
};

export function getSprintKey(iterPath: string): string | null {
  for (const key of Object.keys(SPRINT_DATE_MAP)) {
    if (iterPath.includes(key)) return key;
  }
  return null;
}

export function getSprintDates(iterPath: string): { start: Date; end: Date } | null {
  const key = getSprintKey(iterPath);
  return key ? SPRINT_DATE_MAP[key] : null;
}

export function getSimulatedLastUpdated(item: WorkItemRaw): Date {
  const sprintDates = getSprintDates(item.iterationPath);
  if (!sprintDates) {
    return new Date('2025-01-01');
  }
  if (item.state === 'Closed' || item.state === 'Done') {
    return sprintDates.end;
  }
  const mid = new Date((sprintDates.start.getTime() + sprintDates.end.getTime()) / 2);
  return mid;
}

/**
 * Última actualización del ítem: usa Changed Date del CSV si existe y es válida;
 * si no, usa la fecha simulada por sprint/estado.
 */
export function getLastUpdated(item: WorkItemRaw): Date {
  if (item.changedDate != null && !Number.isNaN(item.changedDate.getTime())) {
    return item.changedDate;
  }
  return getSimulatedLastUpdated(item);
}

export function getSimulatedCreatedDate(item: WorkItemRaw): Date {
  const sprintDates = getSprintDates(item.iterationPath);
  if (!sprintDates) return new Date('2024-12-01');
  return sprintDates.start;
}

export function parseAllWorkItems(): WorkItemRaw[] {
  const csvRaw = getUserStoriesCsvText();
  const lines = csvRaw.split('\n').filter(l => l.trim().length > 0);
  // skip BOM + header
  // Columnas (user_stories.csv): ID;Tipo;Título;Asignado a;Padre;Estado;Área;Tags;Iteración;Última modificación;...
  const items: WorkItemRaw[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], ';');
    if (cols.length < 10) continue;
    const id = parseInt(cols[0], 10);
    if (isNaN(id)) continue;
    items.push({
      id,
      type: cols[1],               // Tipo
      title: cols[2],              // Título
      assignedTo: cols[3]?.split('<')[0]?.trim() || 'Sin asignar', // Asignado a
      parentId: cols[4] ? parseInt(cols[4], 10) || null : null,    // Padre
      state: cols[5],              // Estado
      areaPath: cols[6],           // Área
      tags: cols[7] ? cols[7].split(';').map(t => t.trim()).filter(Boolean) : [],
      iterationPath: cols[8],      // Iteración
      changedDate: parseChangedDate(cols[9]), // Última modificación
    });
  }
  return items;
}

export function getAllSprints(): string[] {
  return Object.keys(SPRINT_DATE_MAP);
}

export function getTeamFromAreaPath(areaPath: string): string {
  const parts = areaPath.split('\\');
  return parts[parts.length - 1] || 'Unknown';
}

export function parseFeatureSnapshots(): FeatureSnapshotRow[] {
  const featureSnapshotRaw = getSnapshotCsvText();
  const lines = featureSnapshotRaw.split('\n').filter(l => l.trim().length > 0);
  // header: snapshot_date,feature_id,feature_title,hu_total,hu_done,hu_active,hu_todo,pct_done,wip_hu,blocked_hu,aging_days,eternal_90_flag,no_active_hu_flag
  const snapshots: FeatureSnapshotRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 4) continue;
    const featureId = parseInt(String(cols[1]), 10);
    if (Number.isNaN(featureId)) continue;

    const snapshotDate = new Date(cols[0]);
    if (Number.isNaN(snapshotDate.getTime())) continue;

    const num = (v: string | undefined) => {
      const n = v ? Number(v) : NaN;
      return Number.isNaN(n) ? 0 : n;
    };

    const aging = cols[10]?.trim() ? Number(cols[10]) : NaN;

    snapshots.push({
      snapshotDate,
      featureId,
      featureTitle: cols[2] ?? '',
      huTotal: num(cols[3]),
      huDone: num(cols[4]),
      huActive: num(cols[5]),
      huToDo: num(cols[6]),
      pctDone: num(cols[7]),
      wipHU: num(cols[8]),
      blockedHU: num(cols[9]),
      agingDays: Number.isNaN(aging) ? null : aging,
      eternal90: String(cols[11]).trim().toLowerCase() === 'true',
      noActiveHU: String(cols[12]).trim().toLowerCase() === 'true',
    });
  }
  return snapshots;
}

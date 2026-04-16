import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Layers,
  OctagonAlert,
  PauseCircle,
  Target,
  Timer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from "lucide-react";
import {
  getFeatureAnalyses,
  getFeatureAgingTrend,
  getHiddenBlockers,
  getHUAnalyses,
  getHUChildrenDetails,
  getHUHealthMetrics,
  getHUDetailsForFeature,
  getThroughputBySprint,
  getWIPBySprint,
  getUniqueAssignees,
  getUniqueFeatureNames,
  getUniqueHuTypes,
  getUniqueSprints,
  getUniqueTeams,
  detectAgingFlowLoss,
  detectThroughputDrop,
  detectWIPStability,
  ACTIVE_STATES,
  DONE_STATES,
  type DashboardFilters,
  type FeatureAnalysis,
  type HUChildDetail,
  type HUExecutionAnalysis,
  type HUHealthMetrics,
  type HUDetail,
  type HiddenBlocker,
  type HURiskCategory,
} from "@/data/dashboardAnalytics";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const agingTrendConfig = {
  value: { label: "Avg Aging (días)", color: "hsl(var(--primary))" },
};

const wipConfig = {
  value: { label: "HU Activas", color: "hsl(var(--warning))" },
};

const throughputConfig = {
  value: { label: "Features Cerradas", color: "hsl(var(--success))" },
};

const featureStackConfig = {
  done: { label: "Done", color: "hsl(var(--success))" },
  active: { label: "Active", color: "hsl(var(--info))" },
  blocked: { label: "Blocked", color: "hsl(var(--destructive))" },
  todo: { label: "To Do", color: "hsl(var(--muted-foreground))" },
};

function StackedBarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as {
    featureName?: string;
    pctDone?: number;
    pctActive?: number;
    pctBlocked?: number;
    pctToDo?: number;
    aging?: number;
  };
  if (!p) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold truncate max-w-[220px]" title={p.featureName}>{p.featureName}</p>
      <p className="text-muted-foreground mt-1">Aging: {p.aging ?? "—"} días</p>
      <p className="mt-1">
        Done {p.pctDone ?? 0}% · Active {p.pctActive ?? 0}% · Blocked {p.pctBlocked ?? 0}% · To Do {p.pctToDo ?? 0}%
      </p>
    </div>
  );
}

// Base URL para enlaces a Azure DevOps (ej: "https://dev.azure.com/org/project/_workitems/edit")
const DEVOPS_BASE_URL = import.meta.env.VITE_DEVOPS_BASE_URL || "";

function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat("es-ES").format(d);
}

type SortKey = "aging" | "blocked" | "name" | "updated";
type HUSortKey = "risk" | "progress" | "bugs" | "bugsClosed";

function riskCategoryRank(c: HURiskCategory): number {
  switch (c) {
    case "critical":
      return 4;
    case "impediment":
      return 3;
    case "paused":
      return 2;
    case "watch":
      return 1;
    default:
      return 0;
  }
}

function HURiskCell({ h }: { h: HUExecutionAnalysis }) {
  const title =
    h.riskCategory === "ok"
      ? "OK · sin reglas críticas (estado Active)"
      : h.riskReasons.length
        ? h.riskReasons.join(" · ")
        : "—";

  let icon: ReactNode;
  switch (h.riskCategory) {
    case "critical":
      icon = <AlertTriangle className="h-4 w-4 text-destructive mx-auto" aria-hidden />;
      break;
    case "impediment":
      icon = <OctagonAlert className="h-4 w-4 text-orange-500 mx-auto" aria-hidden />;
      break;
    case "paused":
      icon = <PauseCircle className="h-4 w-4 text-warning mx-auto" aria-hidden />;
      break;
    case "watch":
      icon = <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" aria-hidden />;
      break;
    default:
      icon = <CheckCircle2 className="h-4 w-4 text-success mx-auto" aria-hidden />;
  }

  return (
    <UiTooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex justify-center w-full cursor-help">{icon}</span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs text-xs">
        <p className="font-semibold mb-1">
          {h.riskCategory === "critical" && "Riesgo ejecución (solo estado Active)"}
          {h.riskCategory === "impediment" && "Impedimento (bloqueo explícito)"}
          {h.riskCategory === "paused" && "En pausa (menor riesgo)"}
          {h.riskCategory === "watch" && "Atención (Staging / Production / …)"}
          {h.riskCategory === "ok" && "Sin riesgo crítico"}
        </p>
        <p className="text-muted-foreground">{title}</p>
      </TooltipContent>
    </UiTooltip>
  );
}

const FeatureAging = () => {
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sprintFilter, setSprintFilter] = useState<string>("all");
  const [featureFilter, setFeatureFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [huTypeFilter, setHuTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("aging");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [huSortBy, setHuSortBy] = useState<HUSortKey>("risk");
  const [huSortDir, setHuSortDir] = useState<"asc" | "desc">("desc");
  const [selectedFeature, setSelectedFeature] = useState<FeatureAnalysis | null>(null);
  const [selectedHU, setSelectedHU] = useState<HUExecutionAnalysis | null>(null);

  const filters: DashboardFilters | undefined = useMemo(() => {
    const f: DashboardFilters = {};
    if (teamFilter !== "all") f.team = teamFilter;
    if (featureFilter !== "all") f.featureName = featureFilter;
    if (assigneeFilter !== "all") f.assignee = assigneeFilter;
    if (huTypeFilter !== "all") f.huType = huTypeFilter;
    return Object.keys(f).length ? f : undefined;
  }, [teamFilter, featureFilter, assigneeFilter, huTypeFilter]);

  const allFeatures = useMemo(() => getFeatureAnalyses(filters), [filters]);
  const features = useMemo(() => {
    if (sprintFilter === "all") return allFeatures;
    return allFeatures.filter(f => f.sprint === sprintFilter);
  }, [allFeatures, sprintFilter]);

  const agingTrend = useMemo(() => getFeatureAgingTrend(filters), [filters]);
  const throughputBySprint = useMemo(() => getThroughputBySprint(filters), [filters]);
  const wipBySprint = useMemo(() => getWIPBySprint(filters), [filters]);
  const hiddenBlockers = useMemo(() => getHiddenBlockers(filters), [filters]);
  const huAnalysesRaw = useMemo(() => getHUAnalyses(filters), [filters]);
  const huHealthRaw: HUHealthMetrics = useMemo(() => getHUHealthMetrics(filters), [filters]);

  const teams = useMemo(() => getUniqueTeams(), []);
  const sprints = useMemo(() => getUniqueSprints(), []);
  const featureNames = useMemo(() => getUniqueFeatureNames(), []);
  const assignees = useMemo(() => getUniqueAssignees(), []);
  const huTypes = useMemo(() => getUniqueHuTypes(), []);

  const activeFeaturesOnly = useMemo(
    () => features.filter(f => ACTIVE_STATES.includes(f.status as typeof ACTIVE_STATES[number])),
    [features],
  );

  const eternal90Features = useMemo(
    () =>
      activeFeaturesOnly.filter(
        f => f.pctDone >= 80 && f.pctDone < 100 && !DONE_STATES.includes(f.status as typeof DONE_STATES[number]),
      ),
    [activeFeaturesOnly],
  );

  const avgAgingOpen = useMemo(
    () =>
      activeFeaturesOnly.length
        ? Math.round(activeFeaturesOnly.reduce((sum, f) => sum + f.aging, 0) / activeFeaturesOnly.length)
        : 0,
    [activeFeaturesOnly],
  );

  const featuresWithBlockedHU = useMemo(
    () => activeFeaturesOnly.filter(f => f.huBlocked > 0),
    [activeFeaturesOnly],
  );

  const featuresWithoutActiveHU = useMemo(
    () =>
      activeFeaturesOnly.filter(f => f.huActive === 0 && f.huTotal > 0),
    [activeFeaturesOnly],
  );

  const avgAgingWithBlocked = useMemo(
    () =>
      featuresWithBlockedHU.length
        ? Math.round(featuresWithBlockedHU.reduce((s, f) => s + f.aging, 0) / featuresWithBlockedHU.length)
        : 0,
    [featuresWithBlockedHU],
  );

  const avgAgingNoActiveHU = useMemo(
    () =>
      featuresWithoutActiveHU.length
        ? Math.round(featuresWithoutActiveHU.reduce((s, f) => s + f.aging, 0) / featuresWithoutActiveHU.length)
        : 0,
    [featuresWithoutActiveHU],
  );

  const blockersByResponsible = useMemo(() => {
    const map = new Map<string, HiddenBlocker[]>();
    hiddenBlockers.forEach(b => {
      const key = b.assignedTo || "Sin asignar";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    });
    return Array.from(map.entries())
      .map(([name, list]) => ({ name, count: list.length, list }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [hiddenBlockers]);

  const wipStable = detectWIPStability(wipBySprint);
  const throughputDrop = detectThroughputDrop(throughputBySprint);
  const agingLoss = detectAgingFlowLoss(agingTrend);

  const featuresSorted = useMemo(() => {
    const list = [...activeFeaturesOnly];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === "aging") return mult * (a.aging - b.aging);
      if (sortBy === "blocked") return mult * (a.huBlocked - b.huBlocked);
      if (sortBy === "updated") return mult * (a.lastUpdated.getTime() - b.lastUpdated.getTime());
      return mult * a.name.localeCompare(b.name);
    });
    return list;
  }, [activeFeaturesOnly, sortBy, sortDir]);

  const stackedFeatureData = useMemo(
    () =>
      activeFeaturesOnly.map(f => ({
        feature: `#${f.id}`,
        featureName: f.name,
        done: f.huDone,
        active: f.huActive,
        blocked: f.huBlocked,
        todo: f.huToDo,
        pctDone: f.pctDone,
        pctActive: f.pctActive,
        pctBlocked: f.pctBlocked,
        pctToDo: f.pctToDo,
        aging: f.aging,
      })),
    [activeFeaturesOnly],
  );

  function getUrgencyLevel(days: number): "high" | "medium" | "low" {
    if (days > 30) return "high";
    if (days > 14) return "medium";
    return "low";
  }

  const selectedFeatureHUDetails: HUDetail[] = useMemo(
    () => (selectedFeature ? getHUDetailsForFeature(selectedFeature.id, filters) : []),
    [selectedFeature, filters],
  );
  const selectedHUChildren: HUChildDetail[] = useMemo(
    () => (selectedHU ? getHUChildrenDetails(selectedHU.huId) : []),
    [selectedHU],
  );

  const huAnalyses = useMemo(() => {
    const activeFeatureIds = new Set(activeFeaturesOnly.map(f => f.id));
    const filteredByFeatureState = huAnalysesRaw.filter(h => activeFeatureIds.has(h.featureId));
    if (sprintFilter === "all") return filteredByFeatureState;
    return filteredByFeatureState.filter(h => h.sprint === sprintFilter);
  }, [huAnalysesRaw, sprintFilter, activeFeaturesOnly]);

  const huAnalysesActive = useMemo(
    () => huAnalyses.filter(h => ACTIVE_STATES.includes(h.huState as typeof ACTIVE_STATES[number])),
    [huAnalyses],
  );

  const huHealth = useMemo(() => {
    const totalHU = huAnalyses.length;
    const activeHU = huAnalysesActive;
    const activeHUCount = activeHU.length;
    const riskHU = activeHU.filter(h => h.atRisk);
    const healthyHU = activeHU.filter(h => h.riskCategory === "ok");
    const avgTasksPerHU = activeHUCount ? Math.round((activeHU.reduce((s, h) => s + h.tasksTotal, 0) / activeHUCount) * 10) / 10 : 0;
    const avgProgressPct = activeHUCount ? Math.round(activeHU.reduce((s, h) => s + h.progressPct, 0) / activeHUCount) : 0;
    const avgBugsPerHU = activeHUCount ? Math.round((activeHU.reduce((s, h) => s + h.bugsCount, 0) / activeHUCount) * 10) / 10 : 0;
    const staleHU = activeHU.filter(h => h.daysWithoutUpdate > 5).length;
    const blockedHU = activeHU.filter(h => h.huState === "Paused" || h.huState === "Impediment").length;
    const map = new Map<string, number>();
    riskHU.forEach(h => map.set(h.assignedTo || "Sin asignar", (map.get(h.assignedTo || "Sin asignar") || 0) + 1));
    const topRiskResponsibles = Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    const healthyPct = activeHUCount ? Math.round((healthyHU.length / activeHUCount) * 100) : 0;
    return {
      ...huHealthRaw,
      totalHU,
      activeHU: activeHUCount,
      healthyHU: healthyHU.length,
      healthyPct,
      riskHU: riskHU.length,
      staleHU,
      blockedHU,
      avgTasksPerHU,
      avgProgressPct,
      avgBugsPerHU,
      topRiskResponsibles,
    };
  }, [huAnalyses, huAnalysesActive, huHealthRaw]);

  const huRowsSorted: HUExecutionAnalysis[] = useMemo(() => {
    const list = [...huAnalysesActive];
    const mult = huSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (huSortBy === "risk") {
        const diff = riskCategoryRank(a.riskCategory) - riskCategoryRank(b.riskCategory);
        if (diff !== 0) return mult * diff;
        return mult * (a.huId - b.huId);
      }
      if (huSortBy === "progress") return mult * (a.progressPct - b.progressPct);
      if (huSortBy === "bugsClosed") return mult * (a.bugsClosedCount - b.bugsClosedCount);
      return mult * (a.bugsCount - b.bugsCount);
    });
    return list;
  }, [huAnalysesActive, huSortBy, huSortDir]);

  const exportAlertsCsv = () => {
    const rows: string[] = [];
    rows.push(
      [
        "TipoAlerta",
        "FeatureId",
        "FeatureNombre",
        "HUId",
        "HUTitulo",
        "Responsable",
        "Equipo",
        "DiasSinActualizacion",
      ].join(";"),
    );

    // Features con efecto 90% eterno
    eternal90Features.forEach(f => {
      rows.push(
        [
          "Feature_90pct_Eterno",
          f.id,
          `"${f.name}"`,
          "",
          "",
          "",
          "",
          "",
        ].join(";"),
      );
    });

    // Features sin HU activas
    featuresWithoutActiveHU.forEach(f => {
      rows.push(
        [
          "Feature_sin_HU_Activas",
          f.id,
          `"${f.name}"`,
          "",
          "",
          "",
          "",
          "",
        ].join(";"),
      );
    });

    // Bloqueos invisibles
    hiddenBlockers.forEach(b => {
      rows.push(
        [
          "Bloqueo_Invisible",
          b.featureId,
          `"${b.featureName}"`,
          b.huId,
          `"${b.huTitle}"`,
          `"${b.assignedTo}"`,
          `"${b.team}"`,
          b.daysWithoutUpdate,
        ].join(";"),
      );
    });

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "feature_aging_alertas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Layers className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
                Feature Aging & Flow Risk
              </h1>
              <p className="text-xs text-sidebar-foreground/70">
                Enfoque profundo en aging de Features y distribución interna de HU.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-8 w-[160px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
                <SelectValue placeholder="Equipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sprintFilter} onValueChange={setSprintFilter}>
              <SelectTrigger className="h-8 w-[140px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
                <SelectValue placeholder="Sprint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los sprints</SelectItem>
                {sprints.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={featureFilter} onValueChange={setFeatureFilter}>
              <SelectTrigger className="h-8 w-[200px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
                <SelectValue placeholder="Feature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las features</SelectItem>
                {featureNames.map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="h-8 w-[180px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
                <SelectValue placeholder="Responsable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los responsables</SelectItem>
                {assignees.map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={huTypeFilter} onValueChange={setHuTypeFilter}>
              <SelectTrigger className="h-8 w-[160px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
                <SelectValue placeholder="Tipo HU" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {huTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-5 px-6 py-5">
        {/* Alertas accionables (semáforo) */}
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Resumen de alertas · Priorizar y contactar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-background p-3">
                <span className="text-xl" aria-hidden>🔴</span>
                <div>
                  <p className="font-semibold text-destructive text-sm">
                    {eternal90Features.length} Features con HU Done ≥ 80% pero Feature abierta
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    → Acción inmediata: cerrar Feature o desbloquear HU pendientes. Responsables en tabla abajo.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-background p-3">
                <span className="text-xl" aria-hidden>🟡</span>
                <div>
                  <p className="font-semibold text-warning text-sm">
                    {featuresWithoutActiveHU.length} Features sin HU activas
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    → Revisar planificación y asignación. Columna Responsable en la tabla.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-background p-3">
                <span className="text-xl" aria-hidden>🔴</span>
                <div>
                  <p className="font-semibold text-destructive text-sm">
                    {hiddenBlockers.length} HU Active sin actualización &gt; 5 días
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    → Contactar: {blockersByResponsible.length
                      ? blockersByResponsible.map(r => `${r.name} (${r.count})`).join(", ")
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Ver tabla “Bloqueadores invisibles” para enlace a HU y responsable.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tarjetas clave */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <UiTooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                    <Target className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Features ≥ 80% HU Done y abiertas
                    </p>
                    <p className="text-2xl font-bold text-foreground">{eternal90Features.length}</p>
                    <p className="text-[10px] text-muted-foreground">Ver tabla → col. %HU Done / Casi completada</p>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Número de Features que tienen al menos el 80% de sus HU cerradas pero siguen abiertas. Son las Features “casi
              terminadas” que requieren decisión de cierre o foco en las HU restantes.
            </TooltipContent>
          </UiTooltip>

          <UiTooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Timer className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Aging promedio Features abiertas
                    </p>
                    <p className="text-2xl font-bold text-foreground">{avgAgingOpen}d</p>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Promedio de días desde la última actualización de todas las Features que siguen abiertas (filtradas por Squad / equipo).
              Un valor alto indica riesgo de retrasos silenciosos.
            </TooltipContent>
          </UiTooltip>

          <UiTooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                    <Eye className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      HU sin actualización &gt; 5 días
                    </p>
                    <p className="text-2xl font-bold text-foreground">{hiddenBlockers.length}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Por responsable: {blockersByResponsible.slice(0, 2).map(r => `${r.name} (${r.count})`).join(", ")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Cantidad de HU activas que llevan más de 5 días sin movimiento. Señalan bloqueos “invisibles” donde es necesario
              contactar al responsable para destrabar el trabajo.
            </TooltipContent>
          </UiTooltip>

          <UiTooltip>
            <TooltipTrigger asChild>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                    <Activity className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Features sin HU activas
                    </p>
                    <p className="text-2xl font-bold text-foreground">{featuresWithoutActiveHU.length}</p>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Features que tienen HU asociadas pero ninguna está en estado activo. Indican trabajo parado o mala planificación
              (nada en ejecución real para esa Feature).
            </TooltipContent>
          </UiTooltip>
        </div>

        {/* Tendencias principales */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Aging Trend */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">
                Feature Aging Trend (días)
              </CardTitle>
              {agingLoss && (
                <Badge
                  variant="outline"
                  className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]"
                >
                  🚨 Aging creciente
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <ChartContainer config={agingTrendConfig} className="aspect-[2/1] w-full">
                <AreaChart data={agingTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-value)"
                    fill="var(--color-value)"
                    fillOpacity={0.12}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* WIP por sprint (línea de tendencia) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">
                WIP (HU Activas) por sprint
              </CardTitle>
              {wipStable && (
                <Badge
                  variant="outline"
                  className="bg-warning/10 text-warning border-warning/30 text-[10px]"
                >
                  🚨 WIP estable
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <ChartContainer config={wipConfig} className="aspect-[2/1] w-full">
                <LineChart data={wipBySprint}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Throughput por sprint */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">
                Throughput por sprint (Features cerradas)
              </CardTitle>
              {throughputDrop && (
                <Badge
                  variant="outline"
                  className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]"
                >
                  🚨 Throughput cayendo
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <ChartContainer config={throughputConfig} className="aspect-[2/1] w-full">
                <BarChart data={throughputBySprint}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Feature vs HU */}
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Feature vs HU (distribución)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={featureStackConfig} className="aspect-[2/3] w-full">
                <BarChart data={stackedFeatureData.slice(0, 20)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="feature" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<StackedBarTooltip />} />
                  <Bar dataKey="done" stackId="a" fill="var(--color-done)" name="Done" />
                  <Bar dataKey="active" stackId="a" fill="var(--color-active)" name="Active" />
                  <Bar dataKey="blocked" stackId="a" fill="var(--color-blocked)" name="Blocked" />
                  <Bar dataKey="todo" stackId="a" fill="var(--color-todo)" name="To Do" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Feature vs HU · Detalle
                <Badge variant="outline" className="text-[10px]">
                  Click en una fila para drill-down
                </Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={exportAlertsCsv}>
                Exportar alertas (CSV)
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Alerta</TableHead>
                      <TableHead className="w-10">ID</TableHead>
                      <TableHead className="min-w-[200px]">Feature</TableHead>
                      <TableHead className="w-24">Responsable</TableHead>
                      <TableHead
                        className="text-center cursor-pointer select-none"
                        onClick={() => {
                          if (sortBy === "aging") setSortDir(prev => prev === "desc" ? "asc" : "desc");
                          else { setSortBy("aging"); setSortDir("desc"); }
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          Aging
                          {sortBy === "aging" ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                        </span>
                      </TableHead>
                      <TableHead className="text-center">HU Tot.</TableHead>
                      <TableHead className="text-center">%HU Done</TableHead>
                      <TableHead className="text-center">Casi completada</TableHead>
                      <TableHead className="text-center">HU Act.</TableHead>
                      <TableHead
                        className="text-center cursor-pointer select-none"
                        onClick={() => {
                          if (sortBy === "blocked") setSortDir(prev => prev === "desc" ? "asc" : "desc");
                          else { setSortBy("blocked"); setSortDir("desc"); }
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          HU Bloq.
                          {sortBy === "blocked" ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                        </span>
                      </TableHead>
                      <TableHead className="text-center">HU To Do</TableHead>
                      <TableHead className="text-xs">Últ. actualización</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {featuresSorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                          Sin features para estos filtros
                        </TableCell>
                      </TableRow>
                    ) : (
                      featuresSorted.map(f => {
                        const isEternal90 =
                          f.pctDone >= 80 &&
                          f.pctDone < 100 &&
                          f.status !== "Closed" &&
                          f.status !== "Done";
                        const isSilentRisk =
                          f.huActive === 0 &&
                          f.status !== "Closed" &&
                          f.status !== "Done" &&
                          f.huTotal > 0;
                        const hasRisk = isEternal90 || isSilentRisk || f.huBlocked > 0;
                        return (
                          <TableRow
                            key={f.id}
                            className="cursor-pointer hover:bg-muted/60"
                            onClick={() => setSelectedFeature(f)}
                          >
                            <TableCell className="text-center">
                              {hasRisk ? (
                                <AlertTriangle className={`h-4 w-4 mx-auto ${isEternal90 ? "text-destructive" : "text-warning"}`} title={isEternal90 ? "90% eterno" : isSilentRisk ? "Sin HU activas" : "Con bloqueos"} />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 mx-auto text-success" title="OK" />
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              #{f.id}
                            </TableCell>
                            <TableCell
                              className="text-sm font-medium max-w-[260px] truncate"
                              title={f.name}
                            >
                              {f.name}
                            </TableCell>
                            <TableCell className="text-xs max-w-[120px] truncate" title={f.assignedTo}>
                              {f.assignedTo}
                            </TableCell>
                            <TableCell className={`text-center font-mono text-xs font-semibold ${f.aging > 120 ? "text-destructive" : f.aging > 60 ? "text-warning" : ""}`}>
                              {f.aging}d
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">{f.huTotal}</TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {f.pctDone}%
                            </TableCell>
                            <TableCell className="text-center text-xs">
                              {isEternal90 ? "Sí" : "No"}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">{f.huActive}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{f.huBlocked}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{f.huToDo}</TableCell>
                            <TableCell className="text-xs">{formatDate(f.lastUpdated)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bloqueos invisibles */}
        <Card id="bloqueadores-invisibles">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              Bloqueadores invisibles (HU Active sin actualización &gt; 5 días)
              <Badge
                variant="outline"
                className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] ml-2"
              >
                {hiddenBlockers.length} detectados
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Urgencia</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead className="w-16">HU ID</TableHead>
                    <TableHead className="min-w-[220px]">HU Título</TableHead>
                    <TableHead>Días sin actualizar</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead className="w-20">Ver HU</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hiddenBlockers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No hay bloqueos invisibles para estos filtros
                      </TableCell>
                    </TableRow>
                  ) : (
                    hiddenBlockers.slice(0, 50).map(b => {
                      const urgency = getUrgencyLevel(b.daysWithoutUpdate);
                      const huUrl = DEVOPS_BASE_URL ? `${DEVOPS_BASE_URL}/${b.huId}` : null;
                      return (
                        <TableRow key={b.huId}>
                          <TableCell className="text-center">
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              title={urgency === "high" ? "Alta (>30d)" : urgency === "medium" ? "Media (>14d)" : "Baja"}
                              style={{
                                backgroundColor:
                                  urgency === "high"
                                    ? "hsl(var(--destructive))"
                                    : urgency === "medium"
                                    ? "hsl(var(--warning))"
                                    : "hsl(var(--muted-foreground))",
                              }}
                            >
                              {urgency === "high" ? "!" : urgency === "medium" ? "•" : "◦"}
                            </span>
                          </TableCell>
                          <TableCell
                            className="text-xs max-w-[220px] truncate"
                            title={b.featureName}
                          >
                            {b.featureName}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{b.huId}
                          </TableCell>
                          <TableCell
                            className="text-sm font-medium max-w-[260px] truncate"
                            title={b.huTitle}
                          >
                            {b.huTitle}
                          </TableCell>
                          <TableCell>
                            <span className="font-mono font-bold text-sm text-destructive">
                              🚨 {b.daysWithoutUpdate}d
                            </span>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{b.assignedTo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {b.team}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {huUrl ? (
                              <a
                                href={huUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" /> Ver
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">#{b.huId}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Salud de ejecución (HU) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Salud de ejecución (HU)</h2>
            <Badge variant="outline" className="text-xs">
              {huHealth.totalHU} HU analizadas · {huHealth.activeHU} activas
            </Badge>
          </div>

          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                HU en riesgo (CRÍTICO)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                <span className="font-semibold text-destructive">{huHealth.riskHU}</span> HU en estado <strong>Active</strong> con
                al menos una regla de riesgo (sin tareas, sin actualización &gt; 7 días y avance &lt; 50%, bugs &gt; 3). Paused e
                Impediment se muestran aparte en la tabla.
              </p>
              <p className="text-xs text-muted-foreground">
                Top responsables: {huHealth.topRiskResponsibles.length
                  ? huHealth.topRiskResponsibles.map(r => `${r.name} (${r.count})`).join(", ")
                  : "Sin responsables en riesgo"}
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">% HU saludables</p>
                <p className={`text-2xl font-bold ${huHealth.healthyPct >= 80 ? "text-success" : huHealth.healthyPct >= 50 ? "text-warning" : "text-destructive"}`}>
                  {huHealth.healthyPct}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">Prom. tareas por HU</p>
                <p className="text-2xl font-bold">{huHealth.avgTasksPerHU}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">Prom. avance</p>
                <p className="text-2xl font-bold">{huHealth.avgProgressPct}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">Bugs promedio</p>
                <p className="text-2xl font-bold">{huHealth.avgBugsPerHU}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">HU sin update &gt; 5d</p>
                <p className="text-2xl font-bold text-destructive">{huHealth.staleHU}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Detalle de ejecución por HU</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() => {
                          if (huSortBy === "risk") setHuSortDir(prev => prev === "desc" ? "asc" : "desc");
                          else { setHuSortBy("risk"); setHuSortDir("desc"); }
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          Riesgo
                          <UiTooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help text-[10px] font-normal">(?)</span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm text-xs">
                              <p className="font-semibold mb-1">Categorías de riesgo</p>
                              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                                <li><span className="text-destructive">Crítico</span>: solo estado Active con reglas (sin tareas, sin update &gt; 5d, aging &gt;7 con avance &lt;50%, bugs &gt;3).</li>
                                <li><span className="text-orange-500">Impedimento</span>: estado Impediment (bloqueo explícito).</li>
                                <li><span className="text-warning">Pausa</span>: estado Paused (menor riesgo).</li>
                                <li><span className="text-amber-500">Atención</span>: otros estados activos (p. ej. Staging, Production) con señales.</li>
                                <li><span className="text-success">OK</span>: sin reglas críticas.</li>
                              </ul>
                            </TooltipContent>
                          </UiTooltip>
                        </span>
                      </TableHead>
                      <TableHead>HU ID</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead>Tareas</TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() => {
                          if (huSortBy === "progress") setHuSortDir(prev => prev === "desc" ? "asc" : "desc");
                          else { setHuSortBy("progress"); setHuSortDir("desc"); }
                        }}
                      >
                        % Avance
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() => {
                          if (huSortBy === "bugs") setHuSortDir(prev => prev === "desc" ? "asc" : "desc");
                          else { setHuSortBy("bugs"); setHuSortDir("desc"); }
                        }}
                      >
                        Bugs
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() => {
                          if (huSortBy === "bugsClosed") setHuSortDir(prev => prev === "desc" ? "asc" : "desc");
                          else { setHuSortBy("bugsClosed"); setHuSortDir("desc"); }
                        }}
                      >
                        Bugs cerr.
                      </TableHead>
                      <TableHead>Días sin update</TableHead>
                      <TableHead>Estructura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {huRowsSorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                          Sin HU para estos filtros
                        </TableCell>
                      </TableRow>
                    ) : huRowsSorted.slice(0, 150).map(h => (
                      <TableRow
                        key={h.huId}
                        className="cursor-pointer hover:bg-muted/60"
                        onClick={() => setSelectedHU(h)}
                      >
                        <TableCell className="text-center">
                          <HURiskCell h={h} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">#{h.huId}</TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate" title={h.featureName}>{h.featureName}</TableCell>
                        <TableCell className="text-xs">{h.assignedTo}</TableCell>
                        <TableCell className="text-xs">{h.tasksDone}/{h.tasksTotal}</TableCell>
                        <TableCell className="text-xs">{h.progressPct}%</TableCell>
                        <TableCell className={`text-xs ${h.bugsCount > 3 ? "text-destructive font-semibold" : ""}`}>{h.bugsCount}</TableCell>
                        <TableCell className="text-xs">{h.bugsClosedCount}</TableCell>
                        <TableCell className={`text-xs ${h.daysWithoutUpdate > 5 ? "text-destructive font-semibold" : ""}`}>{h.daysWithoutUpdate}d</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              h.structureHealth === "green"
                                ? "bg-success/10 text-success border-success/30"
                                : h.structureHealth === "yellow"
                                ? "bg-warning/10 text-warning border-warning/30"
                                : "bg-destructive/10 text-destructive border-destructive/30"
                            }`}
                          >
                            {h.structureHealth === "green" ? "3-8 tareas" : h.structureHealth === "yellow" ? "1-2 / 10+" : "0 tareas"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <Dialog open={!!selectedFeature} onOpenChange={open => !open && setSelectedFeature(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Feature #{selectedFeature?.id} · {selectedFeature?.name}
            </DialogTitle>
            <DialogDescription>
              Detalle de HU, aging individual y posibles bloqueos.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">HU ID</TableHead>
                  <TableHead className="min-w-[220px]">Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Días desde última act.</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Equipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedFeatureHUDetails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Sin HU para esta feature con los filtros actuales
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedFeatureHUDetails.map(hu => (
                    <TableRow key={hu.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{hu.id}
                      </TableCell>
                      <TableCell
                        className="text-sm font-medium max-w-[260px] truncate"
                        title={hu.title}
                      >
                        {hu.title}
                      </TableCell>
                      <TableCell className="text-xs">{hu.type}</TableCell>
                      <TableCell className="text-xs">{hu.state}</TableCell>
                      <TableCell>
                        <span
                          className={`font-mono font-bold text-sm ${
                            hu.daysSinceUpdate > 30
                              ? "text-destructive"
                              : hu.daysSinceUpdate > 10
                              ? "text-warning"
                              : "text-foreground"
                          }`}
                        >
                          {hu.daysSinceUpdate}d
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{hu.assignedTo}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {hu.team}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedHU} onOpenChange={open => !open && setSelectedHU(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              HU #{selectedHU?.huId} · {selectedHU?.huTitle}
            </DialogTitle>
            <DialogDescription>
              Tareas y bugs asociados a esta HU.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead className="min-w-[240px]">Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Días desde última act.</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Equipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedHUChildren.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Esta HU no tiene tareas/bugs asociados
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedHUChildren.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">#{item.id}</TableCell>
                      <TableCell className="text-sm font-medium max-w-[260px] truncate" title={item.title}>{item.title}</TableCell>
                      <TableCell className="text-xs">{item.type}</TableCell>
                      <TableCell className="text-xs">{item.state}</TableCell>
                      <TableCell className="text-xs">{item.daysSinceUpdate}d</TableCell>
                      <TableCell className="text-xs">{item.assignedTo}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{item.team}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeatureAging;


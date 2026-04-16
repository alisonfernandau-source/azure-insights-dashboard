import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Activity, TrendingDown, Eye, Timer, Target, BarChart3, ShieldAlert, Layers,
} from "lucide-react";
import {
  getFeatureAnalyses,
  getFeatureAgingTrend,
  getWIPStability,
  getThroughputTrend,
  getHiddenBlockers,
  getKPIs,
  getUniqueTeams,
  getUniqueSprints,
  getUniqueFeatureNames,
  detectWIPStability,
  detectThroughputDrop,
  detectAgingFlowLoss,
  type FeatureAnalysis,
  type RiskLevel,
  type DashboardFilters,
} from "@/data/dashboardAnalytics";

const riskBadge = (level: RiskLevel) => {
  const map = {
    green: "bg-success/15 text-success border-success/30",
    yellow: "bg-warning/15 text-warning border-warning/30",
    red: "bg-destructive/15 text-destructive border-destructive/30",
  };
  const label = { green: "OK", yellow: "Atención", red: "Riesgo" };
  return <Badge variant="outline" className={`${map[level]} text-[10px] font-bold uppercase tracking-wider`}>{label[level]}</Badge>;
};

const agingTrendConfig = { value: { label: "Avg Aging (días)", color: "hsl(var(--primary))" } };
const wipConfig = { value: { label: "HU Activas", color: "hsl(var(--warning))" } };
const throughputConfig = { value: { label: "Features Cerradas", color: "hsl(var(--success))" } };

const Index = () => {
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sprintFilter, setSprintFilter] = useState<string>("all");
  const [featureFilter, setFeatureFilter] = useState<string>("all");

  const filters: DashboardFilters | undefined = useMemo(() => {
    const f: DashboardFilters = {};
    if (teamFilter !== "all") f.team = teamFilter;
    if (featureFilter !== "all") f.featureName = featureFilter;
    return Object.keys(f).length ? f : undefined;
  }, [teamFilter, featureFilter]);

  const kpis = useMemo(() => getKPIs(filters), [filters]);
  const allFeatures = useMemo(() => getFeatureAnalyses(filters), [filters]);
  const agingTrend = useMemo(() => getFeatureAgingTrend(filters), [filters]);
  const wipData = useMemo(() => getWIPStability(filters), [filters]);
  const throughputData = useMemo(() => getThroughputTrend(filters), [filters]);
  const hiddenBlockers = useMemo(() => getHiddenBlockers(filters), [filters]);
  const teams = useMemo(() => getUniqueTeams(), []);
  const sprints = useMemo(() => getUniqueSprints(), []);
  const featureNames = useMemo(() => getUniqueFeatureNames(), []);

  const features = useMemo(() => {
    let filtered = allFeatures;
    if (sprintFilter !== "all") filtered = filtered.filter(f => f.sprint === sprintFilter);
    return filtered;
  }, [allFeatures, sprintFilter]);

  const wipStable = detectWIPStability(wipData);
  const throughputDrop = detectThroughputDrop(throughputData);
  const agingLoss = detectAgingFlowLoss(agingTrend);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <ShieldAlert className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
                Agile Delivery Intelligence
              </h1>
              <p className="text-xs text-sidebar-foreground/70">
                Detección predictiva de riesgos de entrega · SILIN
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-8 w-[180px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
                <SelectValue placeholder="Equipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sprintFilter} onValueChange={setSprintFilter}>
              <SelectTrigger className="h-8 w-[160px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
                <SelectValue placeholder="Sprint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los sprints</SelectItem>
                {sprints.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={featureFilter} onValueChange={setFeatureFilter}>
              <SelectTrigger className="h-8 w-[220px] border-sidebar-border bg-sidebar-accent text-sidebar-foreground text-xs">
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
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-5 px-6 py-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPICard icon={<Timer className="h-5 w-5 text-primary" />} label="Avg Feature Aging" value={`${kpis.avgAging}d`} accent="primary" />
          <KPICard icon={<Activity className="h-5 w-5 text-info" />} label="HU Activas" value={String(kpis.activeHU)} accent="info" />
          <KPICard icon={<Target className="h-5 w-5 text-success" />} label="Features Cerradas (últ.)" value={String(kpis.closedThisWeek)} accent="success" />
          <KPICard icon={<AlertTriangle className="h-5 w-5 text-destructive" />} label="Features en Riesgo" value={String(kpis.riskFeatures)} accent="destructive" />
        </div>

        {/* Charts Row */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Aging Trend */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Feature Aging Trend</CardTitle>
              {agingLoss && <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">🚨 Flow Loss</Badge>}
            </CardHeader>
            <CardContent>
              <ChartContainer config={agingTrendConfig} className="aspect-[2/1] w-full">
                <AreaChart data={agingTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.12} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* WIP Stability */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">WIP Stability</CardTitle>
              {wipStable && <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">🚨 High Stable WIP</Badge>}
            </CardHeader>
            <CardContent>
              <ChartContainer config={wipConfig} className="aspect-[2/1] w-full">
                <BarChart data={wipData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Throughput */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Throughput Trend</CardTitle>
              {throughputDrop && <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">🚨 Capacity Drop</Badge>}
            </CardHeader>
            <CardContent>
              <ChartContainer config={throughputConfig} className="aspect-[2/1] w-full">
                <BarChart data={throughputData}>
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

        {/* Feature Aging vs Closed HU + Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4" />
              Feature Aging vs HU Completadas · Distribución Interna
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="risk">
              <TabsList className="mb-3">
                <TabsTrigger value="risk">En Riesgo</TabsTrigger>
                <TabsTrigger value="all">Todas</TabsTrigger>
              </TabsList>
              {["risk", "all"].map(tab => {
                const list = tab === "risk"
                  ? features.filter(f => f.riskLevel !== "green")
                  : features;
                return (
                  <TabsContent key={tab} value={tab}>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">ID</TableHead>
                            <TableHead className="min-w-[220px]">Feature</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Aging</TableHead>
                            <TableHead className="text-center">HU</TableHead>
                            <TableHead>Distribución</TableHead>
                            <TableHead>Riesgo</TableHead>
                            <TableHead>Alertas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {list.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                                Sin features para estos filtros
                              </TableCell>
                            </TableRow>
                          ) : list.map(f => (
                            <TableRow key={f.id}>
                              <TableCell className="font-mono text-xs text-muted-foreground">#{f.id}</TableCell>
                              <TableCell className="text-sm font-medium max-w-[280px] truncate" title={f.name}>{f.name}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{f.status}</Badge></TableCell>
                              <TableCell>
                                <span className={`font-mono text-sm font-bold ${f.aging > 120 ? 'text-destructive' : f.aging > 60 ? 'text-warning' : 'text-foreground'}`}>
                                  {f.aging}d
                                </span>
                              </TableCell>
                              <TableCell className="text-center font-mono text-sm">{f.huTotal}</TableCell>
                              <TableCell>
                                <DistributionBar done={f.pctDone} active={f.pctActive} blocked={f.pctBlocked} todo={f.pctToDo} />
                              </TableCell>
                              <TableCell>{riskBadge(f.riskLevel)}</TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  {f.risks.map((r, i) => (
                                    <span key={i} className="text-[10px] text-destructive font-medium">{r}</span>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>

        {/* Hidden Blockers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="h-4 w-4" />
              Bloqueadores Invisibles
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] ml-2">
                {hiddenBlockers.length} detectados
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="w-14">HU ID</TableHead>
                    <TableHead className="min-w-[200px]">HU Título</TableHead>
                    <TableHead>Días sin actualizar</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Equipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hiddenBlockers.slice(0, 20).map(b => (
                    <TableRow key={b.huId}>
                      <TableCell className="text-xs max-w-[200px] truncate" title={b.featureName}>{b.featureName}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">#{b.huId}</TableCell>
                      <TableCell className="text-sm font-medium max-w-[260px] truncate" title={b.huTitle}>{b.huTitle}</TableCell>
                      <TableCell>
                        <span className={`font-mono font-bold text-sm ${b.daysWithoutUpdate > 30 ? 'text-destructive' : 'text-warning'}`}>
                          🚨 {b.daysWithoutUpdate}d
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{b.assignedTo}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{b.team}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

function KPICard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-${accent}/10`}>
          {icon}
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DistributionBar({ done, active, blocked, todo }: { done: number; active: number; blocked: number; todo: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-2.5 w-28 overflow-hidden rounded-full bg-muted">
        {done > 0 && <div className="bg-success h-full" style={{ width: `${done}%` }} />}
        {active > 0 && <div className="bg-info h-full" style={{ width: `${active}%` }} />}
        {blocked > 0 && <div className="bg-destructive h-full" style={{ width: `${blocked}%` }} />}
        {todo > 0 && <div className="bg-muted-foreground/30 h-full" style={{ width: `${todo}%` }} />}
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{done}%</span>
    </div>
  );
}

export default Index;

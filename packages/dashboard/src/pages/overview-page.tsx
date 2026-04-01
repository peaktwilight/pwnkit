import { NavLink } from "react-router-dom";
import { Activity, AlertCircle, Siren, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge, StatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardEmpty, CardEyebrow, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/format";
import type { DashboardResponse } from "@/types";

export function OverviewPage({ data }: { data: DashboardResponse }) {
  const activeScans = data.scans.filter((scan) => scan.status === "running");
  const newFamilies = data.groups.filter((group) => group.latest.triageStatus === "new");
  const highRisk = data.groups.filter((group) =>
    ["critical", "high"].includes(group.latest.severity.toLowerCase()),
  );
  const recentScans = data.scans.slice(0, 6);
  const recentGroups = data.groups.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Operator snapshot"
        summary="Track active scans, triage the newest families, and jump into run detail from one shell."
        actions={
          <Button asChild variant="accent">
            <NavLink to="/findings">Open finding inbox</NavLink>
          </Button>
        }
      />

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Tracked scans"
          value={data.scans.length}
          hint="Runs recorded in the local database"
          tone="accent"
        />
        <MetricCard
          icon={Siren}
          label="Active scans"
          value={activeScans.length}
          hint="Runs still producing events"
          tone="danger"
        />
        <MetricCard
          icon={AlertCircle}
          label="New families"
          value={newFamilies.length}
          hint="Finding families waiting for triage"
          tone="warning"
        />
        <MetricCard
          icon={Sparkles}
          label="Critical / high"
          value={highRisk.length}
          hint="Families that likely need immediate review"
          tone="success"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardEyebrow>Finding families</CardEyebrow>
              <CardTitle className="mt-2">Fresh inbox</CardTitle>
              <CardDescription>Latest deduplicated findings waiting for review.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <NavLink to="/findings">View all</NavLink>
            </Button>
          </CardHeader>
          <CardContent>
            {recentGroups.length === 0 ? (
              <CardEmpty className="text-left">No findings recorded yet.</CardEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Family</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead className="w-[12rem]">Posture</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentGroups.map((group) => (
                    <TableRow key={group.fingerprint}>
                      <TableCell className="font-medium">
                        <NavLink to={`/findings/${group.fingerprint}`} className="text-white hover:text-[var(--accent)]">
                          {group.latest.title}
                        </NavLink>
                      </TableCell>
                      <TableCell className="text-[var(--muted)]">{group.latest.category}</TableCell>
                      <TableCell className="text-[var(--muted)]">
                        {group.count} hits · {group.scanCount} scans
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <SeverityBadge severity={group.latest.severity} />
                          <StatusBadge value={group.latest.triageStatus} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardEyebrow>Scan runs</CardEyebrow>
              <CardTitle className="mt-2">Recent runs</CardTitle>
              <CardDescription>Jump directly into the latest scan dossiers.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <NavLink to="/scans">View all</NavLink>
            </Button>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <CardEmpty className="text-left">No scans recorded yet.</CardEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Target</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="w-[12rem]">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentScans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-medium">
                        <NavLink to={`/scans/${scan.id}`} className="text-white hover:text-[var(--accent)]">
                          {scan.target}
                        </NavLink>
                      </TableCell>
                      <TableCell className="text-[var(--muted)]">
                        {scan.depth} · {scan.runtime} · {scan.mode}
                      </TableCell>
                      <TableCell className="text-[var(--muted)]">{formatDuration(scan.durationMs)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge value={scan.status} />
                          <Badge>{scan.summary.totalFindings} findings</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

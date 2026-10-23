import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Edit, FileCheck, ArrowLeft, Calculator } from "lucide-react";
import { computeTotals } from "@/lib/chimneyDiagramConfig";

export default function ReviewTotals({ sections, report, onEditSection, onSubmit, onBack, onGenerateEstimate }) {
  const stats = useMemo(() => computeTotals(sections), [sections]);

  const allWarnings = useMemo(() => sections.filter(s => s.warning_flag), [sections]);

  const formatWarnings = s => {
    try { return JSON.parse(s.warning_messages || "[]"); } catch { return []; }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">Review Totals</h2>
          <p className="text-sm text-muted-foreground">Verify all measurements before submitting.</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Measure
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Sq Ft</p>
          <p className="text-3xl font-bold">{stats.total.toFixed(1)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Above Roof</p>
          <p className="text-3xl font-bold text-emerald-600">{stats.above.toFixed(1)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Below Roof</p>
          <p className="text-3xl font-bold text-blue-600">{stats.below.toFixed(1)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Roofline/Shoulder</p>
          <p className="text-3xl font-bold text-amber-600">{stats.roofline.toFixed(1)}</p>
        </CardContent></Card>
      </div>

      {allWarnings.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h4 className="font-semibold text-amber-800">Warnings ({allWarnings.length})</h4>
            </div>
            <ul className="space-y-1 text-sm text-amber-700">
              {allWarnings.flatMap(s => formatWarnings(s).map((m, i) => (
                <li key={s.id + i}>Section {s.section_label}: {m}</li>
              )))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Section Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead>Width</TableHead>
                  <TableHead>Height</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Area (sq ft)</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Photo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-bold">{s.section_label}</TableCell>
                    <TableCell>{s.width} {s.unit?.slice(0, 2)}</TableCell>
                    <TableCell>{s.height} {s.unit?.slice(0, 2)}</TableCell>
                    <TableCell>{s.quantity}</TableCell>
                    <TableCell>{(s.area_sqft || 0).toFixed(1)}</TableCell>
                    <TableCell>{s.surface_type}</TableCell>
                    <TableCell>{s.location_zone}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "complete" ? "default" : s.status === "flagged" ? "destructive" : "secondary"}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.photo_url ? "✓" : "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => onEditSection(s)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 text-sm">
          <div><span className="text-muted-foreground">Technician:</span> {report?.technician_name || "—"}</div>
          <div><span className="text-muted-foreground">Job #:</span> {report?.job_number || "—"}</div>
          <div><span className="text-muted-foreground">Date:</span> {report?.submitted_at ? new Date(report.submitted_at).toLocaleString() : new Date().toLocaleString()}</div>
        </CardContent>
      </Card>

      <div className="flex gap-3 flex-wrap">
        <Button onClick={onSubmit} size="lg">
          <FileCheck className="mr-2 h-4 w-4" /> Submit Report
        </Button>
        <Button variant="outline" onClick={onGenerateEstimate}>
          <Calculator className="mr-2 h-4 w-4" /> Generate Estimate Inputs
        </Button>
      </div>
    </div>
  );
}
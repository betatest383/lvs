import React, { useState, useMemo } from "react";
import ChimneyDiagram from "./ChimneyDiagram";
import SectionMeasurePanel from "./SectionMeasurePanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CHIMNEY_TEMPLATES, computeTotals } from "@/lib/chimneyDiagramConfig";
import { ArrowRight, CheckCircle2, ClipboardList } from "lucide-react";

export default function MeasureSections({ template, sections, onSaveSection, onComplete }) {
  const [panelSection, setPanelSection] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const tmpl = CHIMNEY_TEMPLATES[template];

  const stats = useMemo(() => {
    const tmplSections = tmpl.sections.map(label => sections.find(s => s.section_label === label)).filter(Boolean);
    const totals = computeTotals(tmplSections);
    const missing = tmpl.sections.filter(label => {
      const sec = sections.find(s => s.section_label === label);
      return sec?.status !== "complete";
    });
    return { ...totals, missing };
  }, [sections, tmpl]);

  const openSection = label => {
    const sec = sections.find(s => s.section_label === label);
    if (sec) {
      setPanelSection(sec);
      setPanelOpen(true);
    }
  };

  const nextRecommended = () => {
    if (stats.missing.length > 0) openSection(stats.missing[0]);
  };

  const allComplete = stats.missing.length === 0;

  const statusColors = {
    not_started: "bg-slate-100 text-slate-500 border-slate-300",
    in_progress: "bg-amber-100 text-amber-700 border-amber-400",
    complete: "bg-emerald-100 text-emerald-700 border-emerald-500",
    flagged: "bg-red-100 text-red-700 border-red-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">Measure Sections</h2>
          <p className="text-sm text-muted-foreground">{tmpl.name} — {tmpl.subtitle}</p>
        </div>
        <Button onClick={nextRecommended} disabled={allComplete}>
          Next Recommended Section: {stats.missing[0] || "All Done"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="text-2xl font-bold">{stats.complete}/{stats.totalSections}</p>
            <Progress value={stats.completion_percent} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">{stats.completion_percent}% complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Sq Ft</p>
            <p className="text-2xl font-bold">{stats.total.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Above Roof</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.above.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Below: {stats.below.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Missing Sections</p>
            {stats.missing.length === 0 ? (
              <div className="flex items-center gap-1 text-emerald-600 font-semibold mt-1">
                <CheckCircle2 className="h-5 w-5" /> All done!
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 mt-1">
                {stats.missing.map(m => (
                  <Badge key={m} variant="outline" className="cursor-pointer" onClick={() => openSection(m)}>{m}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <Card className="flex-1">
          <CardContent className="p-6 flex justify-center">
            <ChimneyDiagram template={template} sections={sections} onSectionClick={openSection} interactive={true} size="lg" />
          </CardContent>
        </Card>

        <Card className="md:w-64">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-sm">Section Status</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-slate-200 border border-slate-400" /> Not Started
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-amber-200 border border-amber-500" /> In Progress
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-300 border border-emerald-600" /> Complete
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-300 border border-red-600" /> Flagged / Recheck
              </div>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Tap any section on the diagram to enter measurements.</p>
            </div>
            {allComplete && (
              <div className="pt-2 border-t">
                <Button className="w-full" onClick={onComplete}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Review Totals
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold text-sm mb-3">All Sections</h4>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
            {tmpl.sections.map(label => {
              const sec = sections.find(s => s.section_label === label);
              const status = sec?.status || "not_started";
              return (
                <button key={label} onClick={() => openSection(label)} className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition hover:opacity-80 ${statusColors[status]}`}>
                  <span className="font-bold">{label}</span>
                  <span className="text-xs">{sec?.area_sqft ? `${sec.area_sqft.toFixed(1)} sq ft` : "—"}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <SectionMeasurePanel section={panelSection} open={panelOpen} onClose={() => setPanelOpen(false)} onSave={onSaveSection} />
    </div>
  );
}
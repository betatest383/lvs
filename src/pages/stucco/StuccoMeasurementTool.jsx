import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { CHIMNEY_TEMPLATES, SECTION_DEFAULTS, computeTotals } from "@/lib/chimneyDiagramConfig";
import DiagramSelector from "@/components/stucco/DiagramSelector";
import MeasureSections from "@/components/stucco/MeasureSections";
import ReviewTotals from "@/components/stucco/ReviewTotals";
import CompletionScreen from "@/components/stucco/CompletionScreen";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const STEP_LABELS = ["Select Diagram", "Measure Sections", "Review Totals", "Complete"];

export default function StuccoMeasurementTool() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [job, setJob] = useState(null);
  const [user, setUser] = useState(null);
  const [report, setReport] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);

        if (jobId) {
          const j = await base44.entities.Job.get(jobId);
          setJob(j);

          const existing = await base44.entities.ChimneyMeasurementReport.filter({ job_id: jobId });
          const draft = existing.find(r => r.status === "draft" || r.status === "in_progress");
          if (draft) {
            setReport(draft);
            const secs = await base44.entities.ChimneyMeasurementSection.filter({ report_id: draft.id }, "sort_order", 50);
            setSections(secs);
            setStep(2);
          }
        }
      } catch (e) {
        toast({ title: "Error loading data", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId]);

  const handleSelectTemplate = useCallback(async templateKey => {
    setCreating(true);
    try {
      const tmpl = CHIMNEY_TEMPLATES[templateKey];
      const reportData = {
        report_number: `STUCCO-${Date.now().toString().slice(-6)}`,
        job_id: jobId,
        customer_id: job?.customer_id || "",
        customer_name: job?.customer_name || "",
        technician_id: user?.id || "",
        technician_name: user?.full_name || user?.email || "",
        job_number: job?.job_number || job?.crm_job_number || "",
        selected_template: templateKey,
        total_sqft: 0,
        above_roof_sqft: 0,
        below_roof_sqft: 0,
        roofline_sqft: 0,
        completion_percent: 0,
        sections_complete: 0,
        sections_total: tmpl.sections.length,
        status: "in_progress",
      };
      const created = await base44.entities.ChimneyMeasurementReport.create(reportData);
      setReport(created);

      const sectionData = tmpl.sections.map((label, i) => ({
        report_id: created.id,
        section_label: label,
        width: 0,
        height: 0,
        unit: "inches",
        quantity: 1,
        area_sqft: 0,
        surface_type: SECTION_DEFAULTS[label]?.surface_type || "Stucco",
        location_zone: SECTION_DEFAULTS[label]?.location_zone || "Above Roof",
        include_in_total: true,
        photo_required: false,
        photo_url: "",
        notes: "",
        status: "not_started",
        warning_flag: false,
        sort_order: i,
      }));
      const createdSections = await base44.entities.ChimneyMeasurementSection.bulkCreate(sectionData);
      setSections(createdSections);
      setStep(2);
      toast({ title: "Diagram selected", description: `${tmpl.name} — ${tmpl.sections.length} sections ready` });
    } catch (e) {
      toast({ title: "Failed to create report", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }, [jobId, job, user]);

  const handleSaveSection = useCallback(async (originalSection, data) => {
    await base44.entities.ChimneyMeasurementSection.update(originalSection.id, data);
    const updatedSections = sections.map(s => s.id === originalSection.id ? { ...s, ...data } : s);
    setSections(updatedSections);

    const totals = computeTotals(updatedSections);
    const reportData = {
      total_sqft: totals.total,
      above_roof_sqft: totals.above,
      below_roof_sqft: totals.below,
      roofline_sqft: totals.roofline,
      completion_percent: totals.completion_percent,
      sections_complete: totals.complete,
    };
    await base44.entities.ChimneyMeasurementReport.update(report.id, reportData);
    setReport(prev => ({ ...prev, ...reportData }));

    toast({ title: `Section ${originalSection.section_label} saved` });
  }, [sections, report]);

  const handleSubmit = useCallback(async () => {
    try {
      const data = { status: "submitted", submitted_at: new Date().toISOString() };
      await base44.entities.ChimneyMeasurementReport.update(report.id, data);
      setReport(prev => ({ ...prev, ...data }));
      setStep(4);
      toast({ title: "Report submitted!" });
    } catch (e) {
      toast({ title: "Submit failed", description: e.message, variant: "destructive" });
    }
  }, [report]);

  const completionStats = useMemo(() => {
    const totals = computeTotals(sections);
    return {
      totalSqft: totals.total,
      above: totals.above,
      below: totals.below,
      roofline: totals.roofline,
      sectionsComplete: totals.complete,
    };
  }, [sections]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!jobId) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-muted-foreground">No job selected.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded">FRM-STUCCO-001</span>
          <h1 className="text-xl font-bold">Chimney Stucco Measurement Tool</h1>
        </div>
        <div className="flex items-center gap-1 text-xs sm:text-sm">
          {STEP_LABELS.map((label, i) => (
            <React.Fragment key={label}>
              <span className={step === i + 1 ? "font-bold text-primary" : step > i + 1 ? "text-emerald-600" : "text-muted-foreground"}>
                {i + 1}. {label}
              </span>
              {i < STEP_LABELS.length - 1 && <span className="text-muted-foreground mx-1">→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {step === 1 && <DiagramSelector selectedTemplate={report?.selected_template} onSelect={handleSelectTemplate} />}

      {step === 2 && report && (
        <MeasureSections template={report.selected_template} sections={sections} onSaveSection={handleSaveSection} onComplete={() => setStep(3)} />
      )}

      {step === 3 && report && (
        <ReviewTotals
          sections={sections}
          report={report}
          onEditSection={() => setStep(2)}
          onSubmit={handleSubmit}
          onBack={() => setStep(2)}
          onGenerateEstimate={() =>
            toast({ title: "Estimate inputs generated", description: `Total ${completionStats.totalSqft.toFixed(1)} sq ft ready for estimate creation.` })
          }
        />
      )}

      {step === 4 && (
        <CompletionScreen
          stats={completionStats}
          onNewMeasurement={() => { setReport(null); setSections([]); setStep(1); }}
          onGoToJob={() => navigate(jobId ? `/tech/job-hub/${jobId}` : "/")}
        />
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}
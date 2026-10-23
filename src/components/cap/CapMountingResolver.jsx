import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import {
  ShieldCheck, ShieldX, AlertTriangle, CheckCircle2, XCircle,
  Ruler, Layers, ArrowRight, Package, Loader2
} from "lucide-react";
import {
  CAP_QUESTION_IDS, CAP_ANSWER_VALUES, CAP_RESOLVER_STATUS,
  CAP_SELECTION_GROUP, CAP_MAX_COMMITTED_OPTIONS,
} from "@/lib/capQuestionIds";
import {
  extractCapInspectionInputs, resolveCapOptions, determineBoltOnEligibility,
  buildSizingSnapshot,
} from "@/lib/capResolverEngine";
import { evaluateFlueTilePrerequisite, buildPrerequisiteServiceData } from "@/lib/capFlueTileRules";
import CapProductCard from "./CapProductCard";
import FlueTileCutDownCard from "./FlueTileCutDownCard";
import CapFinishColorPicker from "./CapFinishColorPicker";

/**
 * Chimney Cap Mounting and Material Resolver
 *
 * Loads inspection inputs for a job, resolves compatible cap products
 * from the CapSizingMatrix, and presents the technician with mounting
 * method options and product selections.
 *
 * Enforces mutually exclusive selection: only one mounting method may
 * be committed per chimney/flue system (selection_group = chimney_cap_mounting_method).
 */
export default function CapMountingResolver({ jobId, recommendationId: recIdProp }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [mergedAnswers, setMergedAnswers] = useState({});
  const [matrixRecords, setMatrixRecords] = useState([]);
  const [findings, setFindings] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [selectedMountType, setSelectedMountType] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState(null);
  const [flueTileConfirmed, setFlueTileConfirmed] = useState(false);
  const [finishConfig, setFinishConfig] = useState(null);

  // Load job inspection submissions, findings, CapSizingMatrix records, and recommendation
  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    const recPromise = recIdProp
      ? base44.entities.RepairSystemRecommendation.get(recIdProp).catch(() => null)
      : base44.entities.RepairSystemRecommendation.filter({ job_id: jobId, repair_system_type: "cap_chase" }, "-created_date", 5).catch(() => []);
    Promise.all([
      base44.entities.InspectionSubmission.filter({ job_id: jobId, status: "submitted" }, "-created_date", 50),
      base44.entities.CapSizingMatrix.filter({ is_active: true }, "priority", 200),
      base44.entities.InspectionFinding.filter({ job_id: jobId, deficiency_type: "Cap" }, "-created_date", 20),
      recPromise,
    ])
      .then(([subs, matrix, caps, recs]) => {
        setSubmissions(subs || []);
        setMatrixRecords(matrix || []);
        setFindings(caps || []);
        const rec = Array.isArray(recs) ? (recs[0] || null) : recs;
        setRecommendation(rec);
        // If there's a previously confirmed snapshot, restore the confirmed state
        if (rec?.cap_configuration_status === 'confirmed' || rec?.cap_configuration_status === 'outdated') {
          setConfirmed(true);
        }
        // Merge answers from all submissions
        const merged = {};
        for (const sub of subs || []) {
          let answers = {};
          try { answers = JSON.parse(sub.answers || "{}"); } catch {}
          Object.assign(merged, answers);
        }
        setMergedAnswers(merged);
      })
      .catch(err => {
        toast({ variant: "destructive", title: "Failed to load cap data", description: err.message });
      })
      .finally(() => setLoading(false));
  }, [jobId, recIdProp]);

  // Extract inputs and resolve
  const { inputs, missing } = useMemo(() => extractCapInspectionInputs(mergedAnswers), [mergedAnswers]);
  const resolution = useMemo(() => resolveCapOptions(inputs, matrixRecords), [inputs, matrixRecords]);
  const boltOnEligibility = resolution.bolt_on_eligibility || determineBoltOnEligibility(inputs);

  // Evaluate flue tile prerequisite when a crown-mounted product is selected
  const selectedCrownProduct = selectedMountType === "crown_mounted" ? selectedProducts["crown_mounted_0"] : null;
  const flueTileEvaluation = useMemo(
    () => selectedCrownProduct ? evaluateFlueTilePrerequisite(inputs, selectedCrownProduct) : null,
    [selectedCrownProduct, inputs]
  );

  // Reset flue tile confirmation when product changes
  useEffect(() => {
    setFlueTileConfirmed(false);
  }, [selectedCrownProduct]);

  // Auto-select mount type based on eligibility
  useEffect(() => {
    if (!selectedMountType && resolution.status !== CAP_RESOLVER_STATUS.MEASUREMENT_MISSING) {
      if (!boltOnEligibility.eligible) {
        setSelectedMountType("crown_mounted");
      } else if (resolution.crown_mounted_result?.compatible_products?.length > 0 &&
                 resolution.bolt_on_products?.every(f => f.compatible_products.length === 0)) {
        setSelectedMountType("crown_mounted");
      }
    }
  }, [resolution, boltOnEligibility, selectedMountType]);

  const handleSelectProduct = (flueKey, product) => {
    setSelectedProducts(prev => ({ ...prev, [flueKey]: product }));
    setConfirmed(false);
    setFinishConfig(null);
  };

  const handleFinishConfigChange = (config) => {
    setFinishConfig(config);
  };

  const handleConfirm = async () => {
    const selection = Object.values(selectedProducts).filter(Boolean);
    if (selection.length === 0) {
      toast({ variant: "destructive", title: "No product selected" });
      return;
    }
    // Check flue tile cut-down confirmation if required
    if (flueTileEvaluation?.cut_down_service_required && !flueTileConfirmed) {
      toast({ variant: "destructive", title: "Flue tile cut-down confirmation required", description: "Please acknowledge the flue tile cut-down before confirming." });
      return;
    }
    const selectedProduct = selection[0];
    // Require finish color, material/service mapping, and valid pricing for powder-coated products
    if (selectedProduct?.finish === 'powder_coated') {
      if (!selectedProduct.finish_material_id || !selectedProduct.finish_service_id) {
        toast({ variant: "destructive", title: "Finish mapping incomplete", description: "This powder-coated product is missing its finish material or service mapping. Contact an admin." });
        return;
      }
      if (!finishConfig?.selected_color) {
        toast({ variant: "destructive", title: "Finish color required", description: "Please select a powder-coat finish color before confirming." });
        return;
      }
      if (!finishConfig?.matched && (!finishConfig || finishConfig.total_finish_upcharge === 0)) {
        toast({ variant: "destructive", title: "Unresolved finish pricing", description: "No finish pricing rule matched this cap. An admin must configure a pricing tier before confirmation." });
        return;
      }
    }

    // Resolve the recommendation ID — from prop or loaded recommendation
    const recId = recIdProp || recommendation?.id;
    if (!recId) {
      toast({ variant: "destructive", title: "No recommendation found", description: "Cannot persist cap configuration without a linked RepairSystemRecommendation." });
      return;
    }

    // Extract finding IDs from the recommendation or loaded findings
    let findingIds = [];
    if (recommendation?.related_findings) {
      try { findingIds = JSON.parse(recommendation.related_findings); } catch {}
    }
    if (findingIds.length === 0) {
      findingIds = findings.map(f => f.id);
    }

    // Build the immutable snapshot
    const snapshot = buildSizingSnapshot(inputs, selectedProduct, {
      recommendationId: recId,
      findingIds,
      repairTemplateId: recommendation?.repair_recommendation_template_id || '',
      technicianId: recommendation?.created_by || '',
    });
    // Attach flue tile prerequisite data
    if (flueTileEvaluation) {
      snapshot.flue_tile_prerequisite = {
        evaluation: flueTileEvaluation,
        prerequisite_service: buildPrerequisiteServiceData(flueTileEvaluation),
        technician_confirmed: flueTileConfirmed,
      };
    }
    // Attach finish configuration (color, pricing, material/service)
    if (finishConfig) {
      snapshot.finish_configuration = finishConfig;
    }

    // Persist through backend function — do not write directly from React state
    setPersisting(true);
    setPersistError(null);
    try {
      const response = await base44.functions.invoke('persistCapConfiguration', {
        recommendation_id: recId,
        snapshot,
        technician_id: recommendation?.created_by || '',
      });
      const result = response.data || response;
      if (result.status === 'error') {
        throw new Error(result.error || 'Persistence failed');
      }
      setConfirmed(true);
      // Update local recommendation state to reflect persisted status
      if (recommendation) {
        setRecommendation({
          ...recommendation,
          cap_configuration_status: result.cap_configuration_status || 'confirmed',
          cap_configuration_version: result.cap_configuration_version || (recommendation.cap_configuration_version || 0) + 1,
        });
      }
      if (result.outdated) {
        toast({
          variant: "destructive",
          title: "Configuration marked outdated",
          description: result.outdated_reason + " Please reconfirm after reviewing the changes.",
        });
      } else {
        toast({ title: "Cap selection confirmed", description: `${selectedProduct.matrix_name} — sizing snapshot persisted to recommendation.` });
      }
    } catch (err) {
      setPersistError(err.message);
      toast({ variant: "destructive", title: "Failed to persist cap configuration", description: err.message + " — resolver will stay open." });
      // Do NOT set confirmed — keep the resolver open so the technician can retry
    } finally {
      setPersisting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isMissingCap = inputs.capPresent === CAP_ANSWER_VALUES.NO;
  const isDamagedCap = inputs.capPresent === CAP_ANSWER_VALUES.YES && inputs.capDamaged === CAP_ANSWER_VALUES.YES;
  const hasCapFinding = findings.length > 0;

  return (
    <div className="space-y-4 pb-safe">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Chimney Cap Mounting & Material Resolver</h2>
          <p className="text-sm text-muted-foreground">Job {jobId}</p>
        </div>
        {hasCapFinding && (
          <Badge variant="default" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> {findings.length} Cap Finding{findings.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Finding Summary */}
      {(isMissingCap || isDamagedCap) && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Cap Finding</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Deficiency:</span> <span className="font-medium">{isMissingCap ? "Missing Chimney Cap" : "Damaged Chimney Cap"}</span></p>
            <p><span className="text-muted-foreground">Cap Present:</span> {inputs.capPresent || "—"}</p>
            {inputs.capPresent === CAP_ANSWER_VALUES.YES && (
              <p><span className="text-muted-foreground">Cap Damaged:</span> {inputs.capDamaged || "—"}</p>
            )}
            {inputs.mountingMethod && (
              <p><span className="text-muted-foreground">Existing Mounting Method:</span> <span className="font-medium">{inputs.mountingMethod}</span></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* No cap finding — nothing to resolve */}
      {!isMissingCap && !isDamagedCap && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>No cap deficiency detected. A cap is present and not damaged — no cap finding or recommendation will be created.</p>
          </CardContent>
        </Card>
      )}

      {/* Missing Measurements */}
      {missing.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-amber-600"><AlertTriangle className="h-4 w-4" /> Missing Measurements</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {missing.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span>{m.label}</span>
                <Badge variant="outline" className="text-xs ml-auto">Question ID: {m.question_id}</Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground mt-2">These measurements are required before cap material resolution can proceed.</p>
          </CardContent>
        </Card>
      )}

      {/* Inspection Inputs */}
      {missing.length === 0 && (isMissingCap || isDamagedCap) && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Ruler className="h-4 w-4" /> Inspection Inputs</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <InputField label="Flue Shape" value={inputs.flueShape ? inputs.flueShape.charAt(0).toUpperCase() + inputs.flueShape.slice(1) : "—"} />
              <InputField label="Tiles Round?" value={inputs.flueTilesRoundAnswer || "—"} />
              <InputField label="Terracotta Tile Present" value={inputs.terracottaPresent ? "Yes" : "No"} />
              <InputField label="Tile Projection Above Crown" value={inputs.flueProjection !== null ? `${inputs.flueProjection}"` : "—"} />
              <InputField label="Number of Flues" value={inputs.flueCount || "—"} />
              <InputField label="Existing Mounting" value={inputs.mountingMethod || "—"} />
            </div>
            {(inputs.crownMeasurements || inputs.crownDiameter !== null) && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Crown Measurements:</p>
                <div className="flex flex-wrap gap-2">
                  {inputs.crownDiameter !== null
                    ? <Badge variant="secondary">Ø {inputs.crownDiameter}"</Badge>
                    : <Badge variant="secondary">{inputs.crownMeasurements.length}" × {inputs.crownMeasurements.width}"</Badge>}
                </div>
              </div>
            )}
            {inputs.flueEntries && inputs.flueEntries.length > 0 && (
              <div className="mt-3 space-y-2">
                {inputs.flueEntries.map((entry, i) => (
                  <div key={i} className="border rounded-lg p-2">
                    <p className="text-xs text-muted-foreground mb-1">{entry.flue_id} — {entry.shape}</p>
                    <div className="flex flex-wrap gap-2">
                      {entry.shape === 'round' ? (
                        <>
                          <Badge variant="secondary">Interior Ø: {entry.interior.diameter ? `${entry.interior.diameter}"` : '—'}</Badge>
                          <Badge variant="secondary">Exterior Ø: {entry.exterior.diameter ? `${entry.exterior.diameter}"` : '—'}</Badge>
                        </>
                      ) : (
                        <>
                          <Badge variant="secondary">Interior: {entry.interior.length ? `${entry.interior.length}" × ${entry.interior.width}"` : '—'}</Badge>
                          <Badge variant="secondary">Exterior: {entry.exterior.length ? `${entry.exterior.length}" × ${entry.exterior.width}"` : '—'}</Badge>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mounting Eligibility */}
      {missing.length === 0 && (isMissingCap || isDamagedCap) && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Mounting Eligibility</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {/* Bolt-On */}
            <div className={`rounded-lg border p-3 ${boltOnEligibility.eligible ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : "border-red-500/50 bg-red-50 dark:bg-red-950/20"}`}>
              <div className="flex items-center gap-2 mb-1">
                {boltOnEligibility.eligible ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <ShieldX className="h-4 w-4 text-red-600" />}
                <span className="font-medium text-sm">Bolt-On Chimney Cap</span>
                <Badge variant={boltOnEligibility.eligible ? "default" : "destructive"} className="ml-auto">
                  {boltOnEligibility.eligible ? "Eligible" : "Unavailable"}
                </Badge>
              </div>
              {!boltOnEligibility.eligible && boltOnEligibility.reasons.map((r, i) => (
                <p key={i} className="text-xs text-red-600 ml-6">Bolt-on unavailable: {r}.</p>
              ))}
            </div>
            {/* Crown-Mounted */}
            <div className="rounded-lg border p-3 border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-sm">Crown-Mounted Chimney Cap</span>
                <Badge variant="secondary" className="ml-auto">Available</Badge>
              </div>
              <p className="text-xs text-muted-foreground ml-6 mt-1">Available when sufficient crown measurements exist.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mounting Method Selection */}
      {missing.length === 0 && (isMissingCap || isDamagedCap) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" /> Select Mounting Method
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Selection group: <code className="text-xs">{CAP_SELECTION_GROUP}</code> — max {CAP_MAX_COMMITTED_OPTIONS} option.
              Both methods may appear as proposal alternatives, but only one can be committed.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <MountOptionCard
                label="Slip-In"
                selected={selectedMountType === "slip_in"}
                onSelect={() => { setSelectedMountType("slip_in"); setSelectedProducts({}); setConfirmed(false); }}
              />
              <MountOptionCard
                label="Bolt-On (Exterior)"
                disabled={!boltOnEligibility.eligible}
                disabledReason={boltOnEligibility.reasons.join("; ")}
                selected={selectedMountType === "bolt_on_exterior" || selectedMountType === "bolt_on"}
                onSelect={() => { setSelectedMountType("bolt_on_exterior"); setSelectedProducts({}); setConfirmed(false); }}
              />
              <MountOptionCard
                label="Crown-Mounted"
                selected={selectedMountType === "crown_mounted"}
                onSelect={() => { setSelectedMountType("crown_mounted"); setSelectedProducts({}); setConfirmed(false); }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slip-In Product Resolution (per flue — INTERIOR measurements) */}
      {selectedMountType === "slip_in" && (resolution.slip_in_products || []).map((flueResult, idx) => (
        <Card key={idx}>
          <CardHeader>
            <CardTitle className="text-sm">
              Slip-In Products — {flueResult.flue_id || `Flue ${idx + 1}`}
              {flueResult.match_label && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">{flueResult.match_label}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flueResult.status === 'measurement_missing' ? (
              <p className="text-sm text-amber-600">⚠ {flueResult.missing_message}</p>
            ) : flueResult.compatible_products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compatible slip-in product is currently configured for this flue size.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {flueResult.compatible_products.map(p => (
                  <CapProductCard
                    key={p.matrix_id}
                    product={p}
                    isSelected={selectedProducts[`slip_in_${idx}`]?.matrix_id === p.matrix_id}
                    onSelect={(prod) => handleSelectProduct(`slip_in_${idx}`, prod)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Exterior Bolt-On Product Resolution (per flue — EXTERIOR measurements) */}
      {(selectedMountType === "bolt_on_exterior" || selectedMountType === "bolt_on") && resolution.bolt_on_products.map((flueResult, idx) => (
        <Card key={idx}>
          <CardHeader>
            <CardTitle className="text-sm">
              Exterior Bolt-On Products — {flueResult.flue_id || `Flue ${idx + 1}`}
              {flueResult.match_label && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">{flueResult.match_label}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flueResult.status === 'measurement_missing' ? (
              <p className="text-sm text-amber-600">⚠ {flueResult.missing_message}</p>
            ) : flueResult.compatible_products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compatible exterior bolt-on product is currently configured for this flue size.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {flueResult.compatible_products.map(p => (
                  <CapProductCard
                    key={p.matrix_id}
                    product={p}
                    isSelected={selectedProducts[`bolt_on_exterior_${idx}`]?.matrix_id === p.matrix_id}
                    onSelect={(prod) => handleSelectProduct(`bolt_on_exterior_${idx}`, prod)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Crown-Mounted Product Resolution */}
      {selectedMountType === "crown_mounted" && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Crown-Mounted Products</CardTitle></CardHeader>
          <CardContent>
            {resolution.crown_mounted_result.compatible_products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compatible crown-mounted product is currently configured for this crown size.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resolution.crown_mounted_result.compatible_products.map(p => (
                  <CapProductCard
                    key={p.matrix_id}
                    product={p}
                    isSelected={selectedProducts["crown_mounted_0"]?.matrix_id === p.matrix_id}
                    onSelect={(prod) => handleSelectProduct("crown_mounted_0", prod)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Finish Color Picker (shown when selected product is powder-coated) */}
      {selectedMountType && Object.values(selectedProducts).some(p => p?.finish === 'powder_coated') && (
        <CapFinishColorPicker
          product={Object.values(selectedProducts).find(p => p?.finish === 'powder_coated')}
          onFinishConfigChange={handleFinishConfigChange}
        />
      )}

      {/* Flue Tile Cut-Down Prerequisite (crown-mounted multi-flue only) */}
      {flueTileEvaluation?.applicable && (
        <FlueTileCutDownCard
          evaluation={flueTileEvaluation}
          technicianConfirmed={flueTileConfirmed}
          onToggleConfirm={setFlueTileConfirmed}
        />
      )}

      {/* Confirmation */}
      {selectedMountType && Object.values(selectedProducts).some(Boolean) && (
        <Card className="border-accent">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Confirmation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              {Object.entries(selectedProducts).filter(([, v]) => v).map(([key, prod]) => (
                <div key={key} className="flex items-center gap-2 flex-wrap">
                  <ArrowRight className="h-3 w-3 text-accent" />
                  <span className="font-medium">{prod.matrix_name}</span>
                  <Badge variant="outline" className="text-xs">{prod.material_sku || "No SKU"}</Badge>
                  <Badge variant="secondary" className="text-xs capitalize">{prod.mount_type.replace(/_/g, " ")}</Badge>
                  {prod.finish === 'powder_coated' && finishConfig?.selected_color && (
                    <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">
                      <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: finishConfig.selected_color.hex_value }} />
                      {finishConfig.selected_color.display_name}
                    </Badge>
                  )}
                  {prod.finish === 'powder_coated' && !finishConfig?.selected_color && (
                    <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">Color Required</Badge>
                  )}
                </div>
              ))}
              {finishConfig && (
                <p className="text-xs text-muted-foreground">
                  Finish upcharge: <span className="font-medium text-green-700">${finishConfig.total_finish_upcharge.toFixed(2)}</span>
                  {finishConfig.selected_color?.lead_time_adjustment_days > 0 && ` · +${finishConfig.selected_color.lead_time_adjustment_days} day(s) lead time`}
                </p>
              )}
              {(() => {
                const pc = Object.values(selectedProducts).find(p => p?.finish === 'powder_coated');
                if (!pc) return null;
                if (!pc.finish_material_id || !pc.finish_service_id) {
                  return <p className="text-xs text-red-600">⚠ Finish material/service mapping missing on this product — contact admin before confirming.</p>;
                }
                if (finishConfig && !finishConfig.matched && finishConfig.total_finish_upcharge === 0) {
                  return <p className="text-xs text-amber-600">⚠ No finish pricing rule matched this cap — unresolved configuration. Contact admin to add a pricing tier.</p>;
                }
                return null;
              })()}
            </div>
            {persistError && (
              <p className="text-xs text-red-600">⚠ {persistError}</p>
            )}
            {confirmed ? (
              <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Confirmed</Badge>
            ) : (
              <Button onClick={handleConfirm} size="sm" disabled={persisting}>
                {persisting ? <><Loader2 className="h-3 w-3 animate-spin" /> Persisting…</> : "Confirm Selection & Save Snapshot"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              If measurements change, the selection will be marked outdated and require re-confirmation.
              The accepted proposal will not be silently changed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InputField({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function MountOptionCard({ label, selected, disabled, disabledReason, onSelect }) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-lg border p-4 text-left transition-all ${
        selected ? "border-accent bg-accent/5 ring-1 ring-accent" :
        disabled ? "border-muted opacity-50 cursor-not-allowed" :
        "border-border hover:border-accent/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        {selected && <CheckCircle2 className="h-4 w-4 text-accent" />}
        {disabled && <XCircle className="h-4 w-4 text-red-500" />}
      </div>
      {disabled && disabledReason && (
        <p className="text-xs text-red-500 mt-1">Bolt-on unavailable: {disabledReason}.</p>
      )}
    </button>
  );
}
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scissors, AlertTriangle, CheckCircle2, Ruler } from "lucide-react";
import {
  FINAL_PROJECTION_INCHES,
  CUT_DOWN_THRESHOLD_INCHES,
  CUT_DOWN_SERVICE_NAME,
  buildCutDownDisplayMessage,
} from "@/lib/capFlueTileRules";

/**
 * Displays the Flue Tile Cut-Down Prerequisite evaluation for a
 * crown-mounted Multi-Flue Cap selection.
 *
 * Shows per-flue results, the cut-down display message for affected flues,
 * and the prerequisite service requirements.
 */
export default function FlueTileCutDownCard({ evaluation, technicianConfirmed, onToggleConfirm }) {
  if (!evaluation || !evaluation.applicable) return null;

  const { per_flue, affected_flues, cut_down_service_required, required_cap_height } = evaluation;

  return (
    <Card className={cut_down_service_required ? "border-amber-500/50" : "border-blue-500/30"}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {cut_down_service_required ? (
            <Scissors className="h-4 w-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          Flue Tile Prerequisite — Multi-Flue Cap
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs gap-1">
            <Ruler className="h-3 w-3" /> Required Cap Height: {required_cap_height}"
          </Badge>
          {cut_down_service_required ? (
            <Badge variant="destructive" className="text-xs gap-1">
              <Scissors className="h-3 w-3" /> {CUT_DOWN_SERVICE_NAME} Required
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs gap-1 bg-green-100 text-green-700">
              <CheckCircle2 className="h-3 w-3" /> No Cut-Down Required
            </Badge>
          )}
        </div>

        {/* Per-flue results */}
        <div className="space-y-2">
          {per_flue.map((flue, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-3 ${
                flue.cut_required
                  ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                  : "border-green-200 bg-green-50 dark:bg-green-950/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium text-sm">{flue.flue_identifier}</span>
                <Badge variant="outline" className="text-xs">{flue.tier_label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">Original Projection:</span>
                <span className="font-medium">{flue.original_projection}"</span>
                <span className="text-muted-foreground">Planned Final Projection:</span>
                <span className="font-medium">{flue.planned_final_projection}"</span>
                <span className="text-muted-foreground">Inches to Remove:</span>
                <span className="font-medium">{flue.inches_to_remove}"</span>
                <span className="text-muted-foreground">Required Cap Height:</span>
                <span className="font-medium">{flue.required_cap_height}"</span>
              </div>
              {flue.cut_required && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 italic">
                  {buildCutDownDisplayMessage(flue)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Prerequisite service requirements */}
        {cut_down_service_required && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {CUT_DOWN_SERVICE_NAME}
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
              <li>Required in every package containing this Multi-Flue Cap</li>
              <li>Appears in Scope of Work</li>
              <li>Excluded from bolt-on-cap options</li>
              <li>Excluded when all covered flues are {CUT_DOWN_THRESHOLD_INCHES}" or lower</li>
            </ul>
          </div>
        )}

        {/* Technician confirmation */}
        {cut_down_service_required && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="flue-cut-confirm"
              checked={!!technicianConfirmed}
              onChange={(e) => onToggleConfirm?.(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-accent"
            />
            <label htmlFor="flue-cut-confirm" className="text-xs font-medium cursor-pointer">
              Technician confirms: flue tile cut-down understood and will be performed before cap installation.
            </label>
          </div>
        )}

        {/* Original measurement preservation note */}
        <p className="text-xs text-muted-foreground">
          Original inspection measurements are preserved — not overwritten. Only the planned final projection is calculated.
        </p>
      </CardContent>
    </Card>
  );
}
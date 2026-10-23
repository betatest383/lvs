import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Ruler } from "lucide-react";

export default function CompletionScreen({ stats, onNewMeasurement, onGoToJob }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-in zoom-in-50 duration-500">
        <CheckCircle2 className="h-20 w-20 text-emerald-500 mx-auto" />
      </div>
      <h2 className="text-3xl font-bold mt-4 text-center">Measurement Complete</h2>
      <p className="text-muted-foreground mt-2 text-center">{stats.sectionsComplete} surfaces measured</p>

      <Card className="mt-6 w-full max-w-md">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Total Square Footage</p>
          <p className="text-4xl font-bold text-primary">{stats.totalSqft.toFixed(1)} sq ft</p>
          <div className="mt-4 pt-4 border-t flex justify-around text-sm">
            <div>
              <p className="text-muted-foreground">Above Roof</p>
              <p className="font-semibold">{stats.above.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Below Roof</p>
              <p className="font-semibold">{stats.below.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Roofline</p>
              <p className="font-semibold">{stats.roofline.toFixed(1)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center gap-2 text-emerald-600 font-semibold text-lg">
        <Ruler className="h-5 w-5" /> Ready for Estimate
      </div>

      <div className="flex gap-3 mt-8">
        <Button variant="outline" onClick={onGoToJob}>Back to Job</Button>
        <Button onClick={onNewMeasurement}>New Measurement</Button>
      </div>
    </div>
  );
}
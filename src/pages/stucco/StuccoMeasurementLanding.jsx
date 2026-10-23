import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Ruler, Info } from "lucide-react";

export default function StuccoMeasurementLanding() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded">
          FRM-STUCCO-001
        </span>
        <h1 className="text-xl font-bold">Chimney Stucco Measurement Tool</h1>
      </div>

      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center mx-auto">
            <Ruler className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold">Open from a Job Hub</h2>
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-blue-50 rounded-lg p-3 text-left">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <p>
              This measurement tool must be attached to a specific job. Open it from
              the <strong>Stucco Measurement</strong> action card inside any Job Hub.
            </p>
          </div>
          <Button asChild>
            <Link to="/admin/jobs">Go to Jobs</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
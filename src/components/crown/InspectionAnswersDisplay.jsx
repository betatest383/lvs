import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Ruler } from 'lucide-react';

const CROWN_Q = {
  flue_measurements: '69c365ed38b67af793acbe73',
  crown_measurements: '69c365ed38b67af793acbe7d',
  brick_courses: '6a55b11af4425ddf7efd8d65',
  crown_step_in: '6a55b11ac02d312f0d86eb2a',
};

/**
 * Read-only display of inspection answers extracted for the Crown Calculation.
 * This is a REVIEW screen — no data entry. Measurements come from the inspection.
 */
export default function InspectionAnswersDisplay({ answers, measurements, missing, onReturnToInspection }) {
  const missingIds = new Set((missing || []).map(m => m.question_id));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Ruler className="w-4 h-4" />
          Inspection Measurements (Read-Only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <AnswerRow
          label="Crown Measurements (L × W)"
          rawValue={answers?.crown_measurements || ''}
          parsedValue={measurements?.crown_form_length && measurements?.crown_form_width
            ? `${measurements.crown_form_length}" × ${measurements.crown_form_width}"`
            : null}
          isMissing={missingIds.has(CROWN_Q.crown_measurements)}
          onReturnToInspection={onReturnToInspection}
          questionId={CROWN_Q.crown_measurements}
        />
        <AnswerRow
          label="Exterior Flue Tile Measurements"
          rawValue={answers?.flue_measurements || ''}
          parsedValue={measurements?.flues?.length > 0
            ? measurements.flues.map((f, i) => `Flue ${i + 1}: ${f.length}" × ${f.width}"`).join(', ')
            : null}
          isMissing={missingIds.has(CROWN_Q.flue_measurements)}
          onReturnToInspection={onReturnToInspection}
          questionId={CROWN_Q.flue_measurements}
        />
        <AnswerRow
          label="Removing Brick Courses?"
          rawValue={answers?.brick_courses || 'Not answered'}
          parsedValue={measurements?.removing_brick_courses != null
            ? (measurements.removing_brick_courses ? 'Yes' : 'No')
            : null}
          isMissing={false}
        />
        <AnswerRow
          label="Will the Crown Step In?"
          rawValue={answers?.crown_step_in || 'Not answered'}
          parsedValue={measurements?.crown_step_in != null
            ? (measurements.crown_step_in ? 'Yes' : 'No')
            : null}
          isMissing={false}
        />
      </CardContent>
    </Card>
  );
}

function AnswerRow({ label, rawValue, parsedValue, isMissing, onReturnToInspection, questionId }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {parsedValue ? (
            <>
              <span className="text-sm font-medium">{parsedValue}</span>
              <Badge variant="outline" className="text-[10px] text-green-600 border-green-400">From inspection</Badge>
            </>
          ) : isMissing ? (
            <span className="text-sm text-red-600">Missing — complete this inspection question</span>
          ) : (
            <span className="text-sm text-muted-foreground">{rawValue || '—'}</span>
          )}
        </div>
        {rawValue && parsedValue && rawValue !== parsedValue && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Raw: "{rawValue}"</p>
        )}
      </div>
      {isMissing && onReturnToInspection && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReturnToInspection(questionId)}
          className="gap-1.5 shrink-0 h-8 text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Inspection
        </Button>
      )}
    </div>
  );
}
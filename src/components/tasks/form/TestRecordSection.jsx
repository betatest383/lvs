import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FlaskConical, AlertTriangle } from 'lucide-react';

export default function TestRecordSection({ data, updateField, canCreateTestRecord }) {
  if (!canCreateTestRecord) return null;

  const isTestRecord = data.is_test_record === true;
  const testPurpose = data.test_purpose || '';
  const purposeTooShort = isTestRecord && testPurpose.trim().length < 5;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-xs flex items-center gap-1.5">
            <FlaskConical className="w-3.5 h-3.5" />
            Create as Test Record
          </Label>
          <p className="text-xs text-muted-foreground">
            Test records are excluded from production dashboards, queues, and notifications.
          </p>
        </div>
        <Switch
          checked={isTestRecord}
          onCheckedChange={(v) => updateField('is_test_record', v)}
        />
      </div>

      {isTestRecord && (
        <>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <strong>Test Record Mode Active</strong> — This task will be classified as test data.
              It will not appear in production Task Center totals, My Tasks, department queues,
              or trigger any production notifications, approvals, or WorkSessions.
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Test Purpose <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={testPurpose}
              onChange={(e) => updateField('test_purpose', e.target.value)}
              placeholder="e.g. Phase 2 browser acceptance — verifying template-first task creation"
              rows={2}
            />
            {purposeTooShort && (
              <p className="text-xs text-destructive">
                Test purpose is required (minimum 5 characters)
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, Circle, AlertTriangle, ChevronDown, Camera, Clock,
} from 'lucide-react';
import moment from 'moment';
import ConsumableVerificationPanel from '@/components/tech/dashboard/panels/ConsumableVerificationPanel';
import MaterialPickupPanel from '@/components/tech/dashboard/panels/MaterialPickupPanel';
import EquipmentVerificationPanel from '@/components/tech/dashboard/panels/EquipmentVerificationPanel';
import MorningBriefingPanel from '@/components/tech/dashboard/panels/MorningBriefingPanel';

const STATUS_STYLE = {
  complete: { bg: 'bg-green-500', text: 'text-green-600', label: 'Complete', ring: 'ring-green-200' },
  in_progress: { bg: 'bg-blue-500', text: 'text-blue-600', label: 'In Progress', ring: 'ring-blue-200' },
  waiting: { bg: 'bg-amber-400', text: 'text-amber-600', label: 'Waiting', ring: 'ring-amber-200' },
  blocked: { bg: 'bg-red-500', text: 'text-red-600', label: 'Blocked', ring: 'ring-red-200' },
};

function ChecklistItem({ check, workflowChecks, onToggle, disabled }) {
  const entry = workflowChecks[check.id];
  const isComplete = entry?.status === 'complete';
  return (
    <div className="flex items-center justify-between gap-2 text-sm py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {isComplete
          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          : <Circle className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
        <span className={isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}>
          {check.label}
        </span>
      </div>
      {!isComplete && (
        <Button
          size="sm"
          variant="default"
          className="h-6 text-[11px] px-2"
          onClick={() => onToggle(check.id)}
          disabled={disabled}
        >
          Mark Done
        </Button>
      )}
      {isComplete && !disabled && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[11px] px-2"
          onClick={() => onToggle(check.id)}
        >
          Undo
        </Button>
      )}
    </div>
  );
}

function OutstandingPanel({ data }) {
  if (!data || !data.hasOutstanding) {
    return (
      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" /> No outstanding items — previous day reconciled.
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-2 space-y-1.5 text-xs">
      <p className="font-semibold text-red-800 flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5" /> Outstanding Items — Start My Day Blocked
      </p>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {data.outstandingTransfers.length > 0 && (
          <div className="p-1.5 rounded bg-white/60">
            <p className="font-medium text-red-700">Material Transfers ({data.outstandingTransfers.length})</p>
            <p className="text-red-600 truncate">{data.outstandingTransfers.map(t => t.transfer_id || t.id).join(', ')}</p>
          </div>
        )}
        {data.outstandingEquipmentReturns.length > 0 && (
          <div className="p-1.5 rounded bg-white/60">
            <p className="font-medium text-red-700">Equipment Returns ({data.outstandingEquipmentReturns.length})</p>
            <p className="text-red-600 truncate">{data.outstandingEquipmentReturns.map(e => e.item_name).join(', ')}</p>
          </div>
        )}
        {data.outstandingConsumableReturns.length > 0 && (
          <div className="p-1.5 rounded bg-white/60">
            <p className="font-medium text-red-700">Consumable Returns ({data.outstandingConsumableReturns.length})</p>
            <p className="text-red-600 truncate">{data.outstandingConsumableReturns.map(r => r.request_id || r.id).join(', ')}</p>
          </div>
        )}
        {data.outstandingWarehouseRequests.length > 0 && (
          <div className="p-1.5 rounded bg-white/60">
            <p className="font-medium text-red-700">Warehouse Requests ({data.outstandingWarehouseRequests.length})</p>
            <p className="text-red-600 truncate">{data.outstandingWarehouseRequests.map(r => r.request_id || r.id).join(', ')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoVerification({ step, photoUrl, onUpload, disabled }) {
  const label = step.photoRequired ? 'Photo Required' : 'Optional Photo';
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className={`flex items-center gap-1 cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : 'hover:text-accent'}`}>
        <Camera className="w-3.5 h-3.5" />
        <span>{photoUrl ? 'Photo Uploaded ✓' : label}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
      </label>
    </div>
  );
}

export default function WorkflowStepAccordion({
  step, isExpanded, onToggle, workflowChecks, onToggleCheck,
  onUploadPhoto, onOverride, canOverride, record, autoDisplayData,
  onReturnItems, onVerifyItem, onVerifyAll, onReportShortage, onReportWrongItem,
}) {
  const status = step.status;
  const style = STATUS_STYLE[status] || STATUS_STYLE.waiting;
  const isComplete = status === 'complete';
  const isBlocked = status === 'blocked';
  const Icon = step.icon;
  const photoUrl = workflowChecks[`${step.id}_photo`]?.status === 'uploaded'
    ? workflowChecks[`${step.id}_photo`]?.url : null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          isComplete ? 'bg-green-500 text-white' :
          isBlocked ? 'bg-red-500 text-white' :
          isExpanded ? `${style.bg} text-white ring-4 ${style.ring}` :
          'bg-muted text-muted-foreground'
        }`}>
          {isComplete ? <CheckCircle2 className="w-5 h-5" /> :
           isBlocked ? <AlertTriangle className="w-4 h-4" /> :
           <Icon className="w-4 h-4" />}
        </div>
        <div className={`w-0.5 flex-1 min-h-[1.5rem] my-1 ${isComplete ? 'bg-green-300' : 'bg-muted'}`} />
      </div>

      <div className="flex-1 pb-3 min-w-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-2 text-left mb-0.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-muted-foreground">{step.number}.</span>
            <p className="text-sm font-semibold truncate">{step.title}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isExpanded && (
          <div className="space-y-2 mt-1.5">
            <p className="text-xs text-muted-foreground">{step.purpose}</p>

            {step.autoComputed && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg ${isComplete ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                {isComplete ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-700">🟢 Dispatch Ready — All required steps complete.</p>
                      <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> Estimated departure: {moment().format('h:mm A')}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Circle className="w-4 h-4 text-amber-500" />
                    <p className="text-sm font-medium text-amber-700">Complete all required steps to become Dispatch Ready.</p>
                  </>
                )}
              </div>
            )}

            {step.checks?.length > 0 && (
              <div className="space-y-0.5">
                {step.checks.map(check => (
                  <ChecklistItem
                    key={check.id}
                    check={check}
                    workflowChecks={workflowChecks}
                    onToggle={cid => onToggleCheck(cid, step)}
                    disabled={record?.departed}
                  />
                ))}
              </div>
            )}

            {step.autoDisplay && step.id === 'previous_day_closeout' && autoDisplayData && (
              <OutstandingPanel data={autoDisplayData} />
            )}
            {step.autoDisplay && step.id === 'consumable_verification' && autoDisplayData && (
              <ConsumableVerificationPanel
                data={autoDisplayData}
                workflowChecks={workflowChecks}
                onVerifyItem={onVerifyItem}
              />
            )}
            {step.autoDisplay && step.id === 'material_pickup' && autoDisplayData && (
              <MaterialPickupPanel
                data={autoDisplayData}
                workflowChecks={workflowChecks}
                onVerifyAll={onVerifyAll}
                onReportShortage={onReportShortage}
                onReportWrongItem={onReportWrongItem}
                disabled={record?.departed}
              />
            )}
            {step.autoDisplay && step.id === 'equipment_verification' && autoDisplayData && (
              <EquipmentVerificationPanel
                data={autoDisplayData}
                workflowChecks={workflowChecks}
              />
            )}
            {step.autoDisplay && step.id === 'dashboard_review' && autoDisplayData && (
              <MorningBriefingPanel data={autoDisplayData} />
            )}

            {(step.optionalPhoto || step.photoRequired) && (
              <PhotoVerification
                step={step}
                photoUrl={photoUrl}
                onUpload={file => onUploadPhoto(step, file)}
                disabled={record?.departed}
              />
            )}

            {step.actions && step.actions.length > 0 && !record?.departed && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {step.actions.map(action => {
                  if (action.type === 'override') {
                    return canOverride ? (
                      <Button
                        key={action.id}
                        size="sm"
                        variant={action.variant}
                        className="h-7 text-xs"
                        onClick={() => onOverride(step)}
                      >
                        {action.label}
                      </Button>
                    ) : null;
                  }
                  if (action.id === 'return_items' && onReturnItems) {
                    return (
                      <Button
                        key={action.id}
                        size="sm"
                        variant={action.variant}
                        className="h-7 text-xs"
                        onClick={() => onReturnItems(step)}
                      >
                        {action.label}
                      </Button>
                    );
                  }
                  if (action.id === 'report_shortage' && onReportShortage) {
                    return (
                      <Button
                        key={action.id}
                        size="sm"
                        variant={action.variant}
                        className="h-7 text-xs"
                        onClick={() => onReportShortage()}
                      >
                        {action.label}
                      </Button>
                    );
                  }
                  if (action.id === 'report_wrong_item' && onReportWrongItem) {
                    return (
                      <Button
                        key={action.id}
                        size="sm"
                        variant={action.variant}
                        className="h-7 text-xs"
                        onClick={() => onReportWrongItem()}
                      >
                        {action.label}
                      </Button>
                    );
                  }
                  return (
                    <Link key={action.id} to={action.link}>
                      <Button size="sm" variant={action.variant} className="h-7 text-xs">
                        {action.label}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
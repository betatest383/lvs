import { Label } from '@/components/ui/label';
import RegistrySearchCombobox from '@/components/shared/RegistrySearchCombobox';
import {
  searchTrucks, resolveTrucks,
  searchEquipment, resolveEquipment,
  searchSOPs, resolveSOPs,
  searchWorkflows, resolveWorkflows,
  searchBusinessProcesses, resolveBusinessProcesses,
  searchTraining, resolveTraining,
  searchCertifications, resolveCertifications,
  searchCorrectiveActions, resolveCorrectiveActions,
  searchImprovementRequests, resolveImprovementRequests,
} from '@/lib/taskSearchFunctions';

const RECORD_CONFIGS = [
  { key: 'related_truck', label: 'Truck', searchFn: searchTrucks, resolveFn: resolveTrucks, openUrl: '/fleet/trucks/' },
  { key: 'related_equipment', label: 'Equipment', searchFn: searchEquipment, resolveFn: resolveEquipment, openUrl: '/equipment/master/' },
  { key: 'related_sop', label: 'SOP', searchFn: searchSOPs, resolveFn: resolveSOPs, openUrl: '/lvcos/sop-registry' },
  { key: 'related_workflow', label: 'Workflow', searchFn: searchWorkflows, resolveFn: resolveWorkflows, openUrl: '/lvcos/workflow-registry' },
  { key: 'related_business_process', label: 'Business Process', searchFn: searchBusinessProcesses, resolveFn: resolveBusinessProcesses, openUrl: '/lvcos/business-process-registry' },
  { key: 'related_training', label: 'Training', searchFn: searchTraining, resolveFn: resolveTraining, openUrl: '/lvcos/training/detail/' },
  { key: 'related_certification', label: 'Certification', searchFn: searchCertifications, resolveFn: resolveCertifications, openUrl: '/lvcos/certifications/detail/' },
  { key: 'related_corrective_action', label: 'Corrective Action', searchFn: searchCorrectiveActions, resolveFn: resolveCorrectiveActions, openUrl: null },
  { key: 'related_improvement_request', label: 'Improvement Request', searchFn: searchImprovementRequests, resolveFn: resolveImprovementRequests, openUrl: null },
];

export default function RelatedRecordsSection({ data, updateField }) {
  return (
    <div className="space-y-3">
      {RECORD_CONFIGS.map(({ key, label, searchFn, resolveFn, openUrl }) => (
        <div key={key} className="space-y-1.5">
          <Label className="text-xs">{label}</Label>
          <RegistrySearchCombobox
            value={data[key] || ''}
            onChange={(id) => updateField(key, id)}
            searchFn={searchFn}
            resolveFn={resolveFn}
            placeholder={`Search ${label.toLowerCase()}…`}
            onOpenRecord={openUrl ? (id) => window.open(`${openUrl}${id}`, '_blank') : undefined}
          />
        </div>
      ))}
    </div>
  );
}
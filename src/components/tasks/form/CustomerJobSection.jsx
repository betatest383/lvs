import { Label } from '@/components/ui/label';
import RegistrySearchCombobox from '@/components/shared/RegistrySearchCombobox';
import { searchCustomers, resolveCustomers, searchJobs, resolveJobs } from '@/lib/taskSearchFunctions';

export default function CustomerJobSection({ data, updateField }) {
  const handleCustomerChange = (id) => {
    updateField('related_customer', id);
    // Clear job when customer changes
    if (data.related_job && id !== data.related_customer) {
      updateField('related_job', '');
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Customer</Label>
        <RegistrySearchCombobox
          value={data.related_customer || ''}
          onChange={handleCustomerChange}
          searchFn={searchCustomers}
          resolveFn={resolveCustomers}
          placeholder="Search by name, phone, email, address…"
          onOpenRecord={(id) => window.open(`/admin/customers?id=${id}`, '_blank')}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Job</Label>
        <RegistrySearchCombobox
          value={data.related_job || ''}
          onChange={(id) => updateField('related_job', id)}
          searchFn={(q, p, f) => searchJobs(q, p, { ...f, customerId: data.related_customer })}
          resolveFn={resolveJobs}
          placeholder={data.related_customer ? 'Search this customer\'s jobs…' : 'Select a customer first'}
          disabled={!data.related_customer}
          onOpenRecord={(id) => window.open(`/admin/jobs/${id}`, '_blank')}
        />
        {data.related_customer && !data.related_job && (
          <p className="text-xs text-muted-foreground">Selecting a customer enables job search.</p>
        )}
      </div>
    </div>
  );
}
import MasterDataPage from '@/pages/inventory/MasterDataPage';

export default function ManufacturersPage() {
  return (
    <MasterDataPage
      entityName="Manufacturer"
      title="Manufacturers"
      description="Master manufacturer registry for standardized brand data"
      displayField="name"
      codeField="manufacturer_code"
      fields={[
        { name: 'manufacturer_code', label: 'Manufacturer Code', type: 'text' },
        { name: 'name', label: 'Manufacturer Name', type: 'text', required: true },
        { name: 'legal_name', label: 'Legal Name', type: 'text' },
        { name: 'contact_name', label: 'Contact Name', type: 'text' },
        { name: 'email', label: 'Email', type: 'text' },
        { name: 'phone', label: 'Phone', type: 'text' },
        { name: 'website', label: 'Website', type: 'text' },
        { name: 'sort_order', label: 'Sort Order', type: 'text' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
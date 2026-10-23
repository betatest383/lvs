import MasterDataPage from '@/pages/inventory/MasterDataPage';

export default function VendorsPage() {
  return (
    <MasterDataPage
      entityName="Vendor"
      title="Vendors"
      description="Master vendor registry for standardized supplier data"
      displayField="name"
      codeField="vendor_code"
      fields={[
        { name: 'vendor_code', label: 'Vendor Code', type: 'text' },
        { name: 'name', label: 'Vendor Name', type: 'text', required: true },
        { name: 'legal_name', label: 'Legal Name', type: 'text' },
        { name: 'contact_name', label: 'Contact Name', type: 'text' },
        { name: 'email', label: 'Email', type: 'text' },
        { name: 'phone', label: 'Phone', type: 'text' },
        { name: 'website', label: 'Website', type: 'text' },
        { name: 'address', label: 'Address', type: 'text' },
        { name: 'account_number', label: 'Account Number', type: 'text' },
        { name: 'payment_terms', label: 'Payment Terms', type: 'text' },
        { name: 'sort_order', label: 'Sort Order', type: 'text' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
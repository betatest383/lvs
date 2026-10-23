import MasterDataPage from '@/pages/inventory/MasterDataPage';

export default function WarehouseLocationsPage() {
  return (
    <MasterDataPage
      entityName="WarehouseLocation"
      title="Warehouse Locations"
      description="Master list of warehouse storage locations"
      displayField="name"
      codeField="location_code"
      fields={[
        { name: 'location_code', label: 'Location Code', type: 'text' },
        { name: 'name', label: 'Warehouse Name', type: 'text', required: true },
        { name: 'address', label: 'Address', type: 'text' },
        { name: 'city', label: 'City', type: 'text' },
        { name: 'state', label: 'State', type: 'text' },
        { name: 'zip_code', label: 'Zip Code', type: 'text' },
        { name: 'sort_order', label: 'Sort Order', type: 'text' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
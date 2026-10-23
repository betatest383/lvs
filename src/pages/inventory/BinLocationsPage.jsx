import MasterDataPage from '@/pages/inventory/MasterDataPage';

export default function BinLocationsPage() {
  return (
    <MasterDataPage
      entityName="BinLocation"
      title="Bin Locations"
      description="Master list of bin/shelf locations within warehouses"
      displayField="name"
      codeField="bin_code"
      fields={[
        { name: 'bin_code', label: 'Bin Code', type: 'text' },
        { name: 'name', label: 'Bin Name', type: 'text', required: true },
        { name: 'warehouse_location_id', label: 'Warehouse Location ID', type: 'text' },
        { name: 'warehouse_location_name', label: 'Warehouse Location Name', type: 'text' },
        { name: 'zone', label: 'Zone', type: 'text' },
        { name: 'aisle', label: 'Aisle', type: 'text' },
        { name: 'shelf', label: 'Shelf', type: 'text' },
        { name: 'sort_order', label: 'Sort Order', type: 'text' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
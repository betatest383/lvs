import MasterDataPage from '@/pages/inventory/MasterDataPage';

export default function InventoryCategoriesPage() {
  return (
    <MasterDataPage
      entityName="InventoryCategory"
      title="Inventory Categories"
      description="Standardized categories filtered by Inventory Type"
      displayField="name"
      fields={[
        { name: 'name', label: 'Category Name', type: 'text', required: true },
        { name: 'inventory_type', label: 'Inventory Type', type: 'select', required: true, options: ['Consumable', 'Material', 'Equipment', 'Tool', 'Fleet Part', 'Safety Supply', 'Office Supply'] },
        { name: 'description', label: 'Description', type: 'text' },
        { name: 'sort_order', label: 'Sort Order', type: 'text' },
      ]}
    />
  );
}
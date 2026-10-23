import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import EquipmentMasterFormDialog from '@/components/equipment/EquipmentMasterFormDialog';
import { ChevronLeft } from 'lucide-react';

export default function AddEquipment() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div>
        <Link to="/equipment/master" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Equipment Master
        </Link>
        <h1 className="text-2xl font-bold">Add Equipment to Master List</h1>
        <p className="text-sm text-muted-foreground">Create a new equipment type with stock quantities</p>
      </div>

      <EquipmentMasterFormDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) navigate('/equipment/master');
        }}
        initialData={null}
        onSaved={() => navigate('/equipment/master')}
      />
    </div>
  );
}
import RegistryPlaceholder from '@/components/lvcos/RegistryPlaceholder';
import { Shield } from 'lucide-react';

export default function PolicyRegistry() {
  return (
    <RegistryPlaceholder
      title="Policy Registry"
      description="Master catalog of all company policies and governance documents."
      icon={Shield}
    />
  );
}
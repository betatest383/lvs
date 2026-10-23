import RegistryPlaceholder from '@/components/lvcos/RegistryPlaceholder';
import { Plug } from 'lucide-react';

export default function IntegrationRegistry() {
  return (
    <RegistryPlaceholder
      title="Integration Registry"
      description="Catalog of all external integrations and data connections."
      icon={Plug}
    />
  );
}
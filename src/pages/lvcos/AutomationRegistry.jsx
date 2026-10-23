import RegistryPlaceholder from '@/components/lvcos/RegistryPlaceholder';
import { Zap } from 'lucide-react';

export default function AutomationRegistry() {
  return (
    <RegistryPlaceholder
      title="Automation Registry"
      description="Track all automations, their triggers, and deployment status."
      icon={Zap}
    />
  );
}
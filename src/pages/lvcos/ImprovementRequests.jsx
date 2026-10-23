import RegistryPlaceholder from '@/components/lvcos/RegistryPlaceholder';
import { Lightbulb } from 'lucide-react';

export default function ImprovementRequests() {
  return (
    <RegistryPlaceholder
      title="Improvement Requests"
      description="Submit and track improvement ideas for the LVC Operating System."
      icon={Lightbulb}
    />
  );
}
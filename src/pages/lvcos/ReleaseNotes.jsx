import RegistryPlaceholder from '@/components/lvcos/RegistryPlaceholder';
import { GitCommit } from 'lucide-react';

export default function ReleaseNotes() {
  return (
    <RegistryPlaceholder
      title="Release Notes"
      description="Version history and changelog for the LVC Operating System."
      icon={GitCommit}
    />
  );
}
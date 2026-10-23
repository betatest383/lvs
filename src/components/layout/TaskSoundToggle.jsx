import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isSoundEnabled,
  setSoundEnabled,
  subscribeToSoundSetting,
  playTaskChime,
} from '@/lib/taskSound';

/**
 * Sidebar toggle for the task notification chime.
 * Reactively reflects the localStorage-backed setting.
 */
export default function TaskSoundToggle() {
  const enabled = useSyncExternalStore(subscribeToSoundSetting, isSoundEnabled);

  const handleToggle = () => {
    const next = !enabled;
    setSoundEnabled(next);
    // Play a preview chime when enabling so the user hears it immediately.
    if (next) playTaskChime();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent mb-1"
      title={enabled ? 'Notification sound is ON' : 'Notification sound is OFF'}
    >
      {enabled ? (
        <Volume2 className="w-4 h-4 mr-2" />
      ) : (
        <VolumeX className="w-4 h-4 mr-2" />
      )}
      Task Sound {enabled ? 'On' : 'Off'}
    </Button>
  );
}
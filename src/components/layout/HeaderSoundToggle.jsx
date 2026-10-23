import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import {
  isSoundEnabled,
  setSoundEnabled,
  subscribeToSoundSetting,
  playTaskChime,
  unlockAudio,
} from '@/lib/taskSound';

/**
 * Compact icon-only toggle for the mobile/tablet header.
 * Tapping flips the sound setting and shows a toast confirmation.
 */
export default function HeaderSoundToggle({ className = '' }) {
  const enabled = useSyncExternalStore(subscribeToSoundSetting, isSoundEnabled);

  const handleToggle = () => {
    unlockAudio();
    const next = !enabled;
    setSoundEnabled(next);
    if (next) {
      playTaskChime();
      toast.success('Task Sounds: On', {
        description: 'A chime will play when a new task is assigned to you.',
      });
    } else {
      toast.info('Task Sounds: Off', {
        description: 'New task notifications will be silent.',
      });
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center justify-center w-9 h-9 rounded-md transition-colors ${className}`}
      aria-label={`Task Sounds: ${enabled ? 'On' : 'Off'}`}
      title={`Task Sounds: ${enabled ? 'On' : 'Off'}`}
    >
      {enabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
    </button>
  );
}
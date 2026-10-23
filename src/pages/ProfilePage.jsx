import { useState, useSyncExternalStore } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { LogOut, Trash2, Loader2, Bell } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerTrigger } from '@/components/ui/drawer';
import { isSoundEnabled, setSoundEnabled, subscribeToSoundSetting, playTaskChime } from '@/lib/taskSound';

function TaskSoundSetting() {
  const enabled = useSyncExternalStore(subscribeToSoundSetting, isSoundEnabled);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-accent" />
        </div>
        <div>
          <p className="font-medium">Task Notification Sound</p>
          <p className="text-sm text-muted-foreground">Play a chime when a new task is assigned to you.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-medium text-muted-foreground">Task Sounds: {enabled ? 'On' : 'Off'}</span>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setSoundEnabled(v);
            if (v) playTaskChime();
          }}
        />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => base44.auth.logout();

  const handleDeleteAccount = async () => {
    setDeleting(true);
    await base44.entities.User.delete(user.id);
    base44.auth.logout();
  };

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-2xl font-bold">Profile</h1>

      <div className="bg-card border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-lg font-bold text-accent">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div>
            <p className="font-semibold">{user?.full_name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground capitalize">Role: {user?.role || 'user'}</div>
      </div>

      <div className="bg-card border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Notification Settings</h2>
        <TaskSoundSetting />
      </div>

      <Button variant="outline" onClick={handleLogout} className="w-full justify-center gap-2">
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>

      <Drawer open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DrawerTrigger asChild>
          <Button variant="ghost" className="w-full justify-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" /> Delete Account
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Delete Account</DrawerTitle>
            <DrawerDescription>
              This action cannot be undone. All your data will be permanently removed.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="gap-2">
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleting} className="w-full">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Delete My Account
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="w-full">
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
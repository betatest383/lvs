import { Outlet, useLocation } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { useIdentityResolver } from '@/hooks/useIdentityResolver';
import { isTechRole } from '@/lib/roleUtils';
import { Menu, X, LogOut, UserCog, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminSidebar from './AdminSidebar';
import TechSidebar from './TechSidebar';
import CustomerSidebar from './CustomerSidebar';
import RoleSidebar from './RoleSidebar';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import PageTransition from './PageTransition';
import ImpersonationBanner from '@/components/admin/ImpersonationBanner';
import ActAsUserDialog from '@/components/admin/ActAsUserDialog';
import useDarkMode from '@/hooks/useDarkMode';
import { useNavigationOverrides } from '@/hooks/useNavigationOverrides';
import { unlockAudio } from '@/lib/taskSound';
import TaskSoundToggle from './TaskSoundToggle';
import HeaderSoundToggle from './HeaderSoundToggle';
import SafeNotificationLayer from './SafeNotificationLayer';

export default function AppLayout() {
  const { user: authUser, isLoadingAuth } = useAuth();
  const { isImpersonating, impersonatedEmployee } = useImpersonation();
  const { canonicalRole: role, loading: identityLoading } = useIdentityResolver();
  const [user, setUser] = useState(authUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actAsOpen, setActAsOpen] = useState(false);
  const location = useLocation();

  useDarkMode();
  const { isRouteDisabled } = useNavigationOverrides();
  // Global real-time task engine + alert banner — rendered below via
  // SafeNotificationLayer, which wraps both useTaskRealtime() and
  // TaskAlertBanner in an ErrorBoundary so a notification system crash
  // can never blank the entire application.

  // Unlock the Web Audio API on first interaction so iPad Chrome can play
  // the task chime (autoplay is blocked until the user taps the page).
  useEffect(() => {
    const handler = () => unlockAudio();
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(authUser));
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (isLoadingAuth || !user || identityLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Impersonation Banner */}
      <div className="fixed top-0 left-0 right-0 z-[60]">
        <ImpersonationBanner />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <img src="https://media.base44.com/images/public/69c3395b7c5b25bd9cda1d6e/34782e61a_Logo_50_percent.png" alt="Logo" className="w-9 h-9 rounded-lg object-cover" />
          <div>
            <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">Lehigh Valley Chimney</h1>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{role.replace(/_/g, ' ')} Portal</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {(role === 'admin' || role === 'owner') && <AdminSidebar />}
          {isTechRole(role) && <TechSidebar />}
          {role === 'customer' && <CustomerSidebar />}
          {!['admin', 'owner', 'customer'].includes(role) && !isTechRole(role) && <RoleSidebar role={role} />}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-foreground">
              {user.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {isImpersonating && impersonatedEmployee
                  ? `${impersonatedEmployee.first_name} ${impersonatedEmployee.last_name}`
                  : user.full_name}
              </p>
              <p className="text-xs text-sidebar-foreground/50 truncate">
                {isImpersonating ? 'Impersonating' : user.email}
              </p>
            </div>
          </div>
          <TaskSoundToggle />
          {user.role === 'admin' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActAsOpen(true)}
              className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent mb-1"
            >
              <UserCog className="w-4 h-4 mr-2" /> Act As User
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Tablet Sidebar (md-lg): hamburger menu preserved */}
      <div className="hidden md:block lg:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69c3395b7c5b25bd9cda1d6e/34782e61a_Logo_50_percent.png" alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-sm font-bold text-sidebar-foreground">Lehigh Valley Chimney</span>
          </div>
          <div className="flex items-center gap-1">
            <HeaderSoundToggle className="text-sidebar-foreground hover:bg-sidebar-accent" />
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-sidebar-foreground">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Tablet Sidebar Overlay */}
      {sidebarOpen && (
        <div className="hidden md:block lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar pt-16 flex flex-col">
            <nav className="flex-1 overflow-y-auto py-4">
              {(role === 'admin' || role === 'owner') && <AdminSidebar />}
              {isTechRole(role) && <TechSidebar />}
              {role === 'customer' && <CustomerSidebar />}
              {!['admin', 'owner', 'customer'].includes(role) && !isTechRole(role) && <RoleSidebar role={role} />}
            </nav>
            <div className="p-4 border-t border-sidebar-border">
              <TaskSoundToggle />
              <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground/60">
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Mobile Header (phone only) */}
      <MobileHeader role={role} />

      {/* Mobile Bottom Nav (phone only) */}
      <MobileBottomNav role={role} />

      {/* Main Content */}
      <main className={`flex-1 lg:pl-64 pt-12 md:pt-14 lg:pt-0 ${isImpersonating ? 'pt-[88px] md:pt-[100px]' : ''}`}>
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-20 md:pb-6 lg:pb-8">
          {isRouteDisabled(location.pathname) ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">This page has been disabled for your role.</p>
                <p className="text-xs text-muted-foreground mt-2">Contact your administrator for access.</p>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <PageTransition key={location.pathname}>
                <Outlet />
              </PageTransition>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Persistent task alert banner + realtime engine — wrapped in ErrorBoundary */}
      <SafeNotificationLayer />

      {/* Developer diagnostics available at /admin/developer-diagnostics (Owner/Admin only) */}

      {actAsOpen && (
        <ActAsUserDialog open={actAsOpen} onClose={() => setActAsOpen(false)} />
      )}
    </div>
  );
}
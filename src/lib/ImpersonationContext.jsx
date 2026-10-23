import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const ImpersonationContext = createContext(null);

const STORAGE_KEY = 'lvc_impersonation_state';

export const ImpersonationProvider = ({ children }) => {
  const [impersonationState, setImpersonationState] = useState(null);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setImpersonationState(parsed);
      }
    } catch {}
  }, []);

  const startImpersonation = useCallback(async (employee, reason, writeActionsAllowed = false) => {
    const user = await base44.auth.me();
    if (!user) throw new Error('Not authenticated');
    if (user.role !== 'admin') throw new Error('Only administrators can use Act As User');

    const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Create audit log entry via backend
    const res = await base44.functions.invoke('startImpersonation', {
      employee_id: employee.employee_id,
      reason,
      write_actions_allowed: writeActionsAllowed,
      session_id: sessionId,
    });

    const logId = res.data?.log_id;

    const state = {
      logId,
      sessionId,
      employee,
      reason,
      writeActionsAllowed,
      startTime: new Date().toISOString(),
      originalUserId: user.id,
      originalUserName: user.full_name,
      originalUserEmail: user.email,
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setImpersonationState(state);
    return state;
  }, []);

  const endImpersonation = useCallback(async () => {
    if (!impersonationState) return;

    try {
      await base44.functions.invoke('endImpersonation', {
        log_id: impersonationState.logId,
      });
    } catch (err) {
      console.error('Failed to end impersonation audit log', err);
    }

    sessionStorage.removeItem(STORAGE_KEY);
    setImpersonationState(null);
  }, [impersonationState]);

  const logAction = useCallback((action, module) => {
    if (!impersonationState) return;
    // Fire-and-forget — don't block UI
    base44.functions.invoke('logImpersonationAction', {
      log_id: impersonationState.logId,
      action,
      module,
    }).catch(() => {});
  }, [impersonationState]);

  const value = {
    isImpersonating: !!impersonationState,
    impersonation: impersonationState,
    impersonatedEmployee: impersonationState?.employee || null,
    startImpersonation,
    endImpersonation,
    logAction,
  };

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
};

export const useImpersonation = () => {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider');
  return ctx;
};
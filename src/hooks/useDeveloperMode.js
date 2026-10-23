import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';

const STORAGE_KEY = 'lvc_developer_mode_enabled';
const URL_PARAM = 'dev_mode';

/**
 * Environment-aware Developer Mode control.
 *
 * - Dev / Preview: dev mode defaults ON → authorized users see the panel immediately.
 * - Production: dev mode defaults OFF → admin enables via ?dev_mode=true URL param
 *   or the toggle inside the panel.
 *
 * Only Administrator-role users (or a dedicated Developer permission) can ever access
 * developer tools — regardless of environment. Technicians, apprentices, masons, CSRs,
 * dispatchers, warehouse staff, and customers never see developer tools.
 */
function readInitialDevMode(isProduction) {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlVal = urlParams.get(URL_PARAM);
    if (urlVal === 'true') {
      localStorage.setItem(STORAGE_KEY, 'true');
      return true;
    }
    if (urlVal === 'false') {
      localStorage.setItem(STORAGE_KEY, 'false');
      return false;
    }
  } catch { /* ignore */ }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch { /* ignore */ }

  // Default: OFF in all environments — must be explicitly enabled by Owner/Admin
  // via the /admin/developer-diagnostics page toggle or ?dev_mode=true URL param.
  return false;
}

export function useDeveloperMode() {
  const { user } = useAuth();

  const isProduction = import.meta.env.PROD === true || import.meta.env.MODE === 'production';
  const isDevPreview = !isProduction;

  const [devModeEnabled, setDevModeEnabledState] = useState(() => readInitialDevMode(isProduction));

  const toggleDevMode = useCallback(() => {
    setDevModeEnabledState(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Only admins (or dedicated developer permission holders) can access dev tools
  const isAdmin = user?.role === 'admin';
  const canAccessDevTools = isAdmin;

  // Dev tools are visible only when dev mode is ON AND user is authorized
  const isDevToolsVisible = devModeEnabled && canAccessDevTools;

  return {
    devModeEnabled,
    toggleDevMode,
    canAccessDevTools,
    isDevToolsVisible,
    isProduction,
    isDevPreview,
  };
}
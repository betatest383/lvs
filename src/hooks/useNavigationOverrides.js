import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useIdentityResolver } from '@/hooks/useIdentityResolver';

/**
 * Fetches the published navigation visibility overrides for the current user's role.
 *
 * portal_access_mode:
 * - inherited: all routes visible unless explicitly disabled (existing roles)
 * - explicit_allowlist: deny by default, only published 'visible' routes accessible (new roles)
 *
 * Visibility states:
 * - visible (default): displayed and accessible
 * - hidden_from_sidebar: not displayed, but direct-route access remains
 * - access_disabled: hidden AND direct-route access blocked
 * - coming_soon: displayed but disabled, backend access blocked
 */
export function useNavigationOverrides() {
  const { canonicalRole } = useIdentityResolver();
  const [overrides, setOverrides] = useState([]);
  const [landingPage, setLandingPage] = useState(null);
  const [portalAccessMode, setPortalAccessMode] = useState('inherited');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canonicalRole) return;
    setLoading(true);
    base44.functions.invoke('getNavigationOverrides', { role: canonicalRole })
      .then(res => {
        setOverrides(res.data?.overrides || []);
        setLandingPage(res.data?.landing_page || null);
        setPortalAccessMode(res.data?.portal_access_mode || 'inherited');
      })
      .catch(() => {
        setOverrides([]);
        setLandingPage(null);
        setPortalAccessMode('inherited');
      })
      .finally(() => setLoading(false));
  }, [canonicalRole]);

  const getVisibility = useCallback((route) => {
    const match = overrides.find(o => o.route === route);
    if (match) return match.visibility;
    // In explicit_allowlist mode, routes not in overrides are denied by default
    if (portalAccessMode === 'explicit_allowlist') return 'access_disabled';
    return 'visible';
  }, [overrides, portalAccessMode]);

  const isRouteDisabled = useCallback((route) => {
    return getVisibility(route) === 'access_disabled';
  }, [getVisibility]);

  const isRouteHidden = useCallback((route) => {
    const v = getVisibility(route);
    return v === 'hidden_from_sidebar' || v === 'access_disabled';
  }, [getVisibility]);

  return { overrides, landingPage, portalAccessMode, loading, getVisibility, isRouteDisabled, isRouteHidden };
}
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

let _registryCache = null;
let _registryPromise = null;

/**
 * Fetches and caches all RoleRegistry records.
 * Uses a module-level cache so the fetch only happens once
 * even if multiple components call this hook.
 */
export function useRoleRegistry() {
  const [registry, setRegistry] = useState(_registryCache || []);
  const [loading, setLoading] = useState(!_registryCache);

  useEffect(() => {
    let mounted = true;
    if (_registryCache) {
      setRegistry(_registryCache);
      setLoading(false);
      return;
    }
    if (!_registryPromise) {
      _registryPromise = base44.entities.RoleRegistry.filter({}, '-sort_order', 200)
        .then(data => {
          _registryCache = data || [];
          return _registryCache;
        })
        .catch(() => {
          _registryPromise = null;
          return [];
        });
    }
    _registryPromise.then(data => {
      if (mounted) {
        setRegistry(data);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { registry, loading };
}
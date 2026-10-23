import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Paginated, searchable, filterable hook for warehouse materials.
 * Replaces the old .list(500) approach with server-side pagination.
 */
export function useWarehouseMaterials(options = {}) {
  const {
    initialStockedFilter = 'stocked_only',
    initialAssignedFilter = 'all',
    initialPageSize = 50,
  } = options;

  const [materials, setMaterials] = useState([]);
  const [totals, setTotals] = useState({
    catalog_total: 0,
    total_active: 0,
    stocked: 0,
    stocked_assigned: 0,
    stocked_unassigned: 0,
    not_stocked: 0,
    ready_to_count: 0,
  });
  const [permissions, setPermissions] = useState({
    can_assign: false,
    can_count: false,
    can_manage: false,
    can_use_ai: false,
    can_create_location: false,
    can_create_bin: false,
    role: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [stockedFilter, setStockedFilter] = useState(initialStockedFilter);
  const [assignedFilter, setAssignedFilter] = useState(initialAssignedFilter);
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [inventoryType, setInventoryType] = useState('');
  const searchTimerRef = useRef(null);

  const fetchMaterials = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('queryWarehouseMaterials', {
        page: pageNum,
        page_size: initialPageSize,
        search,
        stocked_filter: stockedFilter,
        assigned_filter: assignedFilter,
        location_id: locationId,
        category_id: categoryId,
        manufacturer_id: manufacturerId,
        inventory_type: inventoryType,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);

      if (append) {
        setMaterials(prev => [...prev, ...(data.materials || [])]);
      } else {
        setMaterials(data.materials || []);
      }
      setTotals(data.totals || totals);
      setPermissions(data.permissions || permissions);
      setHasMore(data.has_more || false);
      setPage(pageNum);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      if (!append) setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [search, stockedFilter, assignedFilter, locationId, categoryId, manufacturerId, inventoryType, initialPageSize]);

  // Initial load and when filters change
  useEffect(() => {
    fetchMaterials(1, false);
  }, [stockedFilter, assignedFilter, locationId, categoryId, manufacturerId, inventoryType]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchMaterials(1, false);
    }, 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      fetchMaterials(page + 1, true);
    }
  }, [hasMore, loading, page, fetchMaterials]);

  const refresh = useCallback(() => {
    fetchMaterials(1, false);
  }, [fetchMaterials]);

  return {
    materials,
    totals,
    permissions,
    loading,
    error,
    page,
    hasMore,
    search, setSearch,
    stockedFilter, setStockedFilter,
    assignedFilter, setAssignedFilter,
    locationId, setLocationId,
    categoryId, setCategoryId,
    manufacturerId, setManufacturerId,
    inventoryType, setInventoryType,
    loadMore,
    refresh,
  };
}
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronUp } from 'lucide-react';
import SidebarSection from './SidebarSection';
import { adminSidebarSections } from './adminSidebarConfig';
import { useAuth } from '@/lib/AuthContext';
import { useNavigationOverrides } from '@/hooks/useNavigationOverrides';

function sectionHasActiveLink(section, pathname) {
  return section.links.some(l => {
    if (l.to === '/') return pathname === '/';
    return pathname === l.to || pathname.startsWith(l.to + '/');
  });
}

export default function AdminSidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const storageKey = `admin-sidebar-v2-${user?.email || 'default'}`;

  const { overrides: navOverrides } = useNavigationOverrides();

  // Filter sections: admin-only gating + hide empty sections + apply visibility overrides
  const visibleSections = useMemo(() => {
    const getVis = (route) => {
      const match = navOverrides.find(o => o.route === route);
      return match?.visibility || 'visible';
    };
    return adminSidebarSections
      .filter(s => {
        if (s.adminOnly && !isAdmin) return false;
        return s.links.length > 0;
      })
      .map(section => ({
        ...section,
        links: section.links.map(link => ({
          ...link,
          disabled: getVis(link.to) === 'coming_soon',
          explanation: getVis(link.to) === 'coming_soon' ? 'Coming Soon' : undefined,
        })).filter(link => {
          const vis = getVis(link.to);
          return vis !== 'hidden_from_sidebar' && vis !== 'access_disabled';
        }),
      }))
      .filter(section => section.links.length > 0);
  }, [isAdmin, navOverrides]);

  // Determine which section contains the active route (supports nested routes)
  const activeSectionTitle = useMemo(() => {
    for (const section of visibleSections) {
      if (sectionHasActiveLink(section, location.pathname)) return section.title;
    }
    return null;
  }, [location.pathname, visibleSections]);

  // Initialize from localStorage; on first use collapse all except active section
  const [openSections, setOpenSections] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (activeSectionTitle) parsed[activeSectionTitle] = true;
        return parsed;
      }
    } catch {}
    const initial = {};
    if (activeSectionTitle) initial[activeSectionTitle] = true;
    return initial;
  });

  // Auto-expand the section containing the active page on route change
  useEffect(() => {
    if (!activeSectionTitle) return;
    setOpenSections(prev => {
      if (prev[activeSectionTitle]) return prev;
      const next = { ...prev, [activeSectionTitle]: true };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [activeSectionTitle, storageKey, location.pathname]);

  const toggleSection = (title) => {
    setOpenSections(prev => {
      const next = { ...prev, [title]: !prev[title] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const collapseAll = () => {
    const next = {};
    // Never hide the section containing the active page
    if (activeSectionTitle) next[activeSectionTitle] = true;
    setOpenSections(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  return (
    <div className="space-y-1">
      <div className="px-3 pb-1">
        <button
          onClick={collapseAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          Collapse All
        </button>
      </div>
      {visibleSections.map((section) => {
        const sectionId = section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return (
          <SidebarSection
            key={section.title}
            title={section.title}
            icon={section.icon}
            links={section.links}
            sectionId={sectionId}
            isOpen={!!openSections[section.title]}
            onToggle={() => toggleSection(section.title)}
          />
        );
      })}
      <div className="px-6 py-2 text-[10px] text-sidebar-foreground/30 text-center">
        Collapsible Sidebar v2
      </div>
    </div>
  );
}
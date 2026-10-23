import { useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SidebarLink from './SidebarLink';
import { useTaskBadge } from '@/hooks/useTaskBadge';

export default function SidebarSection({ title, icon: Icon, links, sectionId, isOpen, onToggle }) {
  const location = useLocation();
  const badgeCount = useTaskBadge();
  const hasActiveChild = links.some(l => {
    if (l.to === '/') return location.pathname === '/';
    return location.pathname === l.to || location.pathname.startsWith(l.to + '/');
  });

  const contentId = `sidebar-section-${sectionId}`;

  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className={`flex items-center justify-between w-[calc(100%-1.5rem)] mx-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 select-none ${
          hasActiveChild
            ? 'text-sidebar-foreground bg-sidebar-accent/30'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
        }`}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
          <span className="uppercase tracking-wider text-xs">{title}</span>
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 flex-shrink-0" />
        }
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 pl-3">
              {links.map(link => (
                <SidebarLink key={link.to} {...link} badge={link.to === '/tasks/my-tasks' ? badgeCount : 0} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
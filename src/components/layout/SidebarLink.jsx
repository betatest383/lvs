import { Link, useLocation } from 'react-router-dom';

export default function SidebarLink({ to, icon: Icon, label, disabled, explanation, badge }) {
  const location = useLocation();
  const isActive = !disabled && (location.pathname === to || (to !== '/' && location.pathname.startsWith(to)));

  const badgeEl = badge > 0 && (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold leading-none">
      {badge > 99 ? '99+' : badge}
    </span>
  );

  if (disabled) {
    return (
      <div
        className="flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/30 cursor-not-allowed"
        title={explanation || 'Coming Soon'}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{label}</span>
        {badgeEl}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        isActive
          ? 'bg-sidebar-accent text-accent'
          : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{label}</span>
      {badgeEl}
    </Link>
  );
}
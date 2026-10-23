import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import HeaderSoundToggle from './HeaderSoundToggle';

const ROOT_PATHS = ['/', '/admin/dashboard', '/tech/dashboard', '/customer/dashboard'];

export default function MobileHeader({ role }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isRoot = ROOT_PATHS.includes(location.pathname);

  const getTitle = () => {
    const p = location.pathname;
    if (p === '/' || p.endsWith('/dashboard')) return 'Dashboard';
    const segment = p.split('/').filter(Boolean).pop() || '';
    return segment.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border select-none mobile-header">
      <div className="flex items-center h-11 px-3 pt-safe">
        {!isRoot ? (
          <button onClick={() => navigate(-1)} className="flex items-center gap-0.5 text-accent mr-2 -ml-1 p-1">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69c3395b7c5b25bd9cda1d6e/34782e61a_Logo_50_percent.png" alt="Logo" className="w-7 h-7 rounded-lg object-cover" />
          </div>
        )}
        <h1 className="flex-1 text-center text-sm font-semibold truncate">{getTitle()}</h1>
        <HeaderSoundToggle className="text-foreground hover:bg-muted" />
      </div>
    </header>
  );
}
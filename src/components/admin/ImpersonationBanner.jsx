import React from 'react';
import { Button } from '@/components/ui/button';
import { useImpersonation } from '@/lib/ImpersonationContext';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeftRight, Eye, Edit3 } from 'lucide-react';

export default function ImpersonationBanner() {
  const { isImpersonating, impersonation, endImpersonation } = useImpersonation();
  const navigate = useNavigate();

  if (!isImpersonating || !impersonation) return null;

  const emp = impersonation.employee;
  const startTime = new Date(impersonation.startTime).toLocaleString();
  const writeAllowed = impersonation.writeActionsAllowed;

  return (
    <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 font-bold uppercase text-xs tracking-wide">
            <ShieldAlert className="w-4 h-4" />
            Acting As
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{emp.first_name} {emp.last_name}</span>
            {emp.primary_role && <span className="text-white/80">· {emp.primary_role}</span>}
            {emp.department && <span className="text-white/80">· {emp.department}</span>}
          </div>
          <span className="text-white/70 text-xs hidden md:inline">Started: {startTime}</span>
          {writeAllowed ? (
            <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
              <Edit3 className="w-3 h-3" /> Write Enabled
            </span>
          ) : (
            <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
              <Eye className="w-3 h-3" /> View Only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white text-orange-600 hover:bg-white/90 h-8"
            onClick={() => navigate(emp.default_landing_page || '/')}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Go to Dashboard
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="bg-white text-orange-600 hover:bg-white/90 h-8"
            onClick={() => endImpersonation()}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Return to My Account
          </Button>
        </div>
      </div>
    </div>
  );
}
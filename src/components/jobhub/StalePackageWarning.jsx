import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Visible warning banner shown when one or more packages are stale.
 *
 * Message: "This package changed after pricing or scope was completed.
 * Review and recalculate before continuing."
 */
export default function StalePackageWarning({ stalePackages = [], onRecalculate }) {
  if (!stalePackages || stalePackages.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-amber-900">
              This package changed after pricing or scope was completed. Review and recalculate before continuing.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stalePackages.map(pkg => (
                <Badge
                  key={pkg.id}
                  variant="outline"
                  className="text-xs border-amber-400 bg-white text-amber-800"
                >
                  {pkg.name || pkg.package_number || 'Unnamed'}
                  {pkg.stale_reason ? ` — ${pkg.stale_reason.replace(/_/g, ' ')}` : ''}
                </Badge>
              ))}
            </div>
          </div>
          {onRecalculate && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-amber-400 text-amber-800 hover:bg-amber-100 flex-shrink-0"
              onClick={onRecalculate}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Recalculate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
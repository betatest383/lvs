import { Card, CardContent } from '@/components/ui/card';

export default function StatCard({ label, value, icon: Icon, color = 'text-accent', subtitle }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
            {subtitle && <p className="text-xs text-muted-foreground/70 truncate">{subtitle}</p>}
          </div>
          {Icon && (
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
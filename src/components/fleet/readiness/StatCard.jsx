import { Card, CardContent } from "@/components/ui/card";

export default function StatCard({ icon: Icon, label, value, color, bg, onClick, subtitle }) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
      onClick={onClick}
    >
      <CardContent className="p-3 flex items-center gap-3">
        {Icon && (
          <div className={`w-9 h-9 rounded-lg ${bg || 'bg-muted'} flex items-center justify-center shrink-0`}>
            <Icon className={`w-4 h-4 ${color || 'text-muted-foreground'}`} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
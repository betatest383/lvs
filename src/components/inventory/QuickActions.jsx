import { Button } from '@/components/ui/button';
import {
  ArrowDownToLine, SlidersHorizontal, Repeat, Bookmark,
  UserPlus, RotateCcw, AlertTriangle, Archive, History,
} from 'lucide-react';

const ACTIONS = [
  { type: 'receive',            label: 'Receive',     icon: ArrowDownToLine },
  { type: 'adjust',             label: 'Adjust',      icon: SlidersHorizontal },
  { type: 'transfer',           label: 'Transfer',    icon: Repeat },
  { type: 'reserve',            label: 'Reserve',      icon: Bookmark },
  { type: 'assign',             label: 'Assign',       icon: UserPlus },
  { type: 'return',             label: 'Return',       icon: RotateCcw },
  { type: 'damage',             label: 'Damage',       icon: AlertTriangle },
  { type: 'retire',             label: 'Retire',       icon: Archive },
];

export default function QuickActions({ onAction, onViewHistory }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(a => {
        const Icon = a.icon;
        return (
          <Button
            key={a.type}
            variant="outline"
            size="sm"
            onClick={() => onAction(a.type)}
            className="gap-1.5"
          >
            <Icon className="w-3.5 h-3.5" />
            {a.label}
          </Button>
        );
      })}
      <Button
        variant="secondary"
        size="sm"
        onClick={onViewHistory}
        className="gap-1.5"
      >
        <History className="w-3.5 h-3.5" />
        View Transaction History
      </Button>
    </div>
  );
}
import { ArrowRight, ArrowDown } from 'lucide-react';

// Shows the inspection question dependency flow:
// Measurement → Logic Rule → Derived Result → Finding → Repair System →
// Estimate → Scope of Work → Scheduling → Warehouse

const FLOW_STEPS = [
  { label: 'Measurement', role: 'measurement', color: 'amber' },
  { label: 'Logic Rule', role: null, color: 'blue' },
  { label: 'Derived Result', role: 'derived_result', color: 'green' },
  { label: 'Finding', role: 'observation', color: 'red' },
  { label: 'Repair System', role: null, color: 'purple' },
  { label: 'Estimate', role: null, color: 'orange' },
  { label: 'Scope of Work', role: null, color: 'indigo' },
  { label: 'Scheduling', role: null, color: 'cyan' },
  { label: 'Warehouse', role: null, color: 'gray' },
];

const COLOR_CLASSES = {
  amber: 'bg-amber-100 text-amber-700 border-amber-300',
  blue: 'bg-blue-100 text-blue-700 border-blue-300',
  green: 'bg-green-100 text-green-700 border-green-300',
  red: 'bg-red-100 text-red-700 border-red-300',
  purple: 'bg-purple-100 text-purple-700 border-purple-300',
  orange: 'bg-orange-100 text-orange-700 border-orange-300',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  gray: 'bg-gray-100 text-gray-600 border-gray-300',
};

export default function DependencyFlow({ activeRole }) {
  return (
    <div className="flex items-center gap-1 flex-wrap p-3 bg-muted/30 rounded-lg border border-border">
      {FLOW_STEPS.map((step, idx) => {
        const isActive = !activeRole || step.role === activeRole;
        const colorClass = COLOR_CLASSES[step.color] || COLOR_CLASSES.gray;
        return (
          <div key={step.label} className="flex items-center gap-1">
            <span
              className={`px-2 py-1 rounded-md text-[10px] font-medium border ${colorClass} ${
                isActive ? 'opacity-100 ring-2 ring-offset-1 ring-accent/30' : 'opacity-40'
              }`}
            >
              {step.label}
            </span>
            {idx < FLOW_STEPS.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0 hidden sm:block" />
            )}
            {idx < FLOW_STEPS.length - 1 && (
              <ArrowDown className="w-3 h-3 text-muted-foreground flex-shrink-0 sm:hidden" />
            )}
          </div>
        );
      })}
    </div>
  );
}
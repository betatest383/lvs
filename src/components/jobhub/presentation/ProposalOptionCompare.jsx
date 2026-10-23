import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, CreditCard } from 'lucide-react';

const TIER_LABELS = { good: 'Good', better: 'Better', best: 'Best' };

export default function ProposalOptionCompare({ packages, selectedTier, onSelectTier }) {
  if (packages.length === 0) return null;

  const rows = [
    { label: 'Included Repairs', key: 'repairs' },
    { label: 'Benefits', key: 'benefits' },
    { label: 'Warranty', key: 'warranty' },
    { label: 'Estimated Duration', key: 'duration' },
    { label: 'Total Price', key: 'price' },
    { label: 'Financing Available', key: 'financing' },
  ];

  const getCellContent = (pkg, key) => {
    switch (key) {
      case 'repairs':
        return pkg.matchedItems.length > 0
          ? pkg.matchedItems.map(i => i.service_name).join(', ')
          : '—';
      case 'benefits':
        return pkg.option.customer_benefits || '—';
      case 'warranty':
        return pkg.option.warranty_messaging || '—';
      case 'duration':
        return pkg.option.estimated_duration || '—';
      case 'price':
        return `$${pkg.totalPrice.toFixed(2)}`;
      case 'financing':
        return pkg.option.financing_available ? 'Yes' : 'No';
      default:
        return '—';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 border-b bg-muted/50 sticky left-0 min-w-[120px]">Feature</th>
            {packages.map(pkg => {
              const isSelected = selectedTier === pkg.level;
              return (
                <th
                  key={pkg.level}
                  className={`p-2 border-b text-center cursor-pointer transition-all ${isSelected ? 'bg-accent/10' : 'bg-muted/50 hover:bg-muted'}`}
                  onClick={() => onSelectTier(pkg.level)}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-bold text-sm">{TIER_LABELS[pkg.level]}</span>
                    <span className="text-[10px] text-muted-foreground">{pkg.option.option_title}</span>
                    {isSelected && <CheckCircle2 className="w-3 h-3 text-accent" />}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.key} className={ri % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
              <td className="p-2 border-b font-semibold text-muted-foreground sticky left-0 bg-inherit">{row.label}</td>
              {packages.map(pkg => {
                const content = getCellContent(pkg, row.key);
                const isSelected = selectedTier === pkg.level;
                return (
                  <td
                    key={pkg.level}
                    className={`p-2 border-b text-center cursor-pointer ${isSelected ? 'bg-accent/5 font-medium' : ''}`}
                    onClick={() => onSelectTier(pkg.level)}
                  >
                    {row.key === 'financing' ? (
                      content === 'Yes'
                        ? <Badge variant="outline" className="text-[9px] gap-0.5"><CreditCard className="w-2.5 h-2.5" /> Yes</Badge>
                        : <XCircle className="w-3 h-3 text-muted-foreground inline" />
                    ) : (
                      <span className="text-xs">{content}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-1 text-center">Click any column to select that option</p>
    </div>
  );
}
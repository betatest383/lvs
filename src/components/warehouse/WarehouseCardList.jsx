import { Card, CardContent } from '@/components/ui/card';

export default function WarehouseCardList({ data, renderCard, onRowClick, emptyMessage }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        {emptyMessage || 'No records found'}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {data.map((item, i) => (
        <Card
          key={item.id || i}
          className={`border shadow-sm hover:shadow-md transition-shadow ${onRowClick ? 'cursor-pointer' : ''}`}
          onClick={() => onRowClick?.(item)}
        >
          <CardContent className="p-4">
            {renderCard(item)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Warehouse, Grid3x3, Tags, Building2, Factory, ArrowRight } from 'lucide-react';

const masterDataLinks = [
  { to: '/inventory/warehouses', title: 'Warehouse Locations', description: 'Master list of warehouse storage locations', icon: Warehouse, color: 'text-blue-600 bg-blue-50' },
  { to: '/inventory/bins', title: 'Bin Locations', description: 'Bins and shelves within warehouses', icon: Grid3x3, color: 'text-purple-600 bg-purple-50' },
  { to: '/inventory/categories', title: 'Inventory Categories', description: 'Standardized categories by inventory type', icon: Tags, color: 'text-orange-600 bg-orange-50' },
  { to: '/inventory/vendors', title: 'Vendors', description: 'Master vendor registry', icon: Building2, color: 'text-green-600 bg-green-50' },
  { to: '/inventory/manufacturers', title: 'Manufacturers', description: 'Master manufacturer registry', icon: Factory, color: 'text-cyan-600 bg-cyan-50' },
];

export default function MasterDataHub() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Master Data</h2>
        <p className="text-xs text-muted-foreground">Standardized lookup data for inventory items — prevents duplicate spelling variations</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {masterDataLinks.map(link => (
          <Link key={link.to} to={link.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg p-2.5 ${link.color}`}>
                    <link.icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mt-3">{link.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{link.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
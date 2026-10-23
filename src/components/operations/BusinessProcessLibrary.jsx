import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight, Network } from 'lucide-react';

const STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Planned: 'bg-gray-100 text-gray-700',
  'Under Review': 'bg-amber-100 text-amber-700',
  Retired: 'bg-red-100 text-red-700',
};

export default function BusinessProcessLibrary({ data }) {
  const processes = data.businessProcesses || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Network className="w-4 h-4" /> Business Process Library
        </CardTitle>
      </CardHeader>
      <CardContent>
        {processes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No business processes defined yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-2 py-1.5 font-medium">ID</th>
                  <th className="px-2 py-1.5 font-medium">Business Process</th>
                  <th className="px-2 py-1.5 font-medium hidden md:table-cell">Owner</th>
                  <th className="px-2 py-1.5 font-medium hidden sm:table-cell">SOPs</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {processes.map((bp) => (
                  <tr key={bp.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-2 py-2 font-mono text-xs">{bp.process_id}</td>
                    <td className="px-2 py-2 font-medium">{bp.title}</td>
                    <td className="px-2 py-2 text-muted-foreground hidden md:table-cell">{bp.owner || '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground hidden sm:table-cell">{bp.related_sop_ids?.length || 0}</td>
                    <td className="px-2 py-2">
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[bp.status] || 'bg-gray-100 text-gray-700'}`}>
                        {bp.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Link to="/lvcos/business-process-registry">
                        <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
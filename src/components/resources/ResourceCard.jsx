import { Link } from 'react-router-dom';
import {
  File, BookOpen, FileText, Image as ImageIcon, Video, ShieldCheck,
  Wrench, Settings, Network, ClipboardList
} from 'lucide-react';
import { getStatusBadgeClass, formatFileSize } from '@/lib/productResourceConstants';

const ICON_MAP = {
  'Manual': BookOpen,
  'Brochure': FileText,
  'Image': ImageIcon,
  'Parts Diagram': Network,
  'Video': Video,
  'Spec Sheet': ClipboardList,
  'Warranty Document': ShieldCheck,
  'Installation Guide': Wrench,
  'Service Guide': Settings,
  'Other': File,
};

export default function ResourceCard({ resource }) {
  const Icon = ICON_MAP[resource.resource_type] || File;
  return (
    <Link to={`/resources/detail/${resource.id}`} className="block">
      <div className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow h-full">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2 shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate">{resource.title}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {resource.manufacturer || '—'}
            </p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${getStatusBadgeClass(resource.status)}`}>
            {resource.status}
          </span>
        </div>
        {resource.tags && resource.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {resource.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>{resource.resource_type}</span>
          <span>{formatFileSize(resource.file_size)}</span>
        </div>
      </div>
    </Link>
  );
}
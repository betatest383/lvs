import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, ChevronDown, ChevronRight, Database, Type, Hash,
  Calendar, ToggleLeft, ListTree, Sun, ListChecks, Bell, Users, UserPlus,
  Package, Truck, Gauge, Undo2, ArrowLeftRight, ClipboardCheck,
  AlertTriangle, Lightbulb, Plug, Award, GraduationCap, Shield, Layers,
  HardHat, Settings, Cpu, Building, ClipboardList, FileText, FileSpreadsheet,
  Presentation, MonitorPlay, CheckCircle, CalendarClock, Flag, Briefcase,
  CalendarPlus, Send, Warehouse, Boxes, ShoppingCart, Scale, Wrench,
  DollarSign, Calculator, Settings2, Layers3, BarChart3, LayoutDashboard,
} from 'lucide-react';
import {
  MODULE_EVENTS, ALL_EVENTS, MODULES_BY_CATEGORY, MODULE_CATEGORIES,
  getTotalEventCount, getModuleCount, getActiveModuleCount,
} from '@/lib/moduleEventRegistry';

const ICONS = {
  Sun, ListChecks, Bell, Users, UserPlus, Package, Truck, Gauge, Undo2,
  ArrowLeftRight, ClipboardCheck, AlertTriangle, Lightbulb, Plug, Award,
  GraduationCap, Shield,
  HardHat, Settings, Cpu, Building, ClipboardList, FileText, FileSpreadsheet,
  Presentation, MonitorPlay, CheckCircle, CalendarClock, Flag, Briefcase,
  CalendarPlus, Send, Warehouse, Boxes, ShoppingCart, Scale, Wrench,
  DollarSign, Calculator, Settings2, Layers3, BarChart3, LayoutDashboard,
};

const FIELD_TYPE_ICONS = {
  string: Type,
  number: Hash,
  datetime: Calendar,
  date: Calendar,
  boolean: ToggleLeft,
  array: ListTree,
};

const FIELD_TYPE_COLORS = {
  string: 'text-blue-600 bg-blue-50',
  number: 'text-purple-600 bg-purple-50',
  datetime: 'text-amber-600 bg-amber-50',
  date: 'text-amber-600 bg-amber-50',
  boolean: 'text-green-600 bg-green-50',
  array: 'text-pink-600 bg-pink-50',
};

export default function AvailableEventsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedModules, setExpandedModules] = useState(new Set(MODULE_EVENTS.map(m => m.moduleKey)));

  const filteredCategories = useMemo(() => {
    let categories = MODULES_BY_CATEGORY;
    if (activeCategory !== 'all') {
      categories = categories.filter(c => c.key === activeCategory);
    }
    if (!search) return categories;
    const q = search.toLowerCase();
    return categories.map(cat => ({
      ...cat,
      modules: cat.modules.map(mod => ({
        ...mod,
        events: mod.events.filter(evt =>
          evt.event.toLowerCase().includes(q) ||
          evt.eventKey.toLowerCase().includes(q) ||
          evt.description.toLowerCase().includes(q) ||
          evt.fields.some(f => f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))
        ),
      })).filter(mod => mod.events.length > 0 || mod.reserved),
    })).filter(cat => cat.modules.length > 0);
  }, [search, activeCategory]);

  const toggleModule = (key) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedModules(new Set(MODULE_EVENTS.map(m => m.moduleKey)));
  const collapseAll = () => setExpandedModules(new Set());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Available Events</h1>
        <p className="text-muted-foreground text-sm">
          {getTotalEventCount()} events registered across {getActiveModuleCount()} active modules ({getModuleCount()} total including reserved). Each event exposes fields usable as rule trigger conditions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events, fields, or modules..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={expandAll}><ChevronDown className="w-3.5 h-3.5 mr-1" /> Expand All</Button>
        <Button variant="outline" size="sm" onClick={collapseAll}><ChevronRight className="w-3.5 h-3.5 mr-1" /> Collapse All</Button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${activeCategory === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
        >
          All Categories
        </button>
        {MODULE_CATEGORIES.map(cat => {
          const CatIcon = ICONS[cat.icon] || Database;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${activeCategory === cat.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
            >
              <CatIcon className="w-3 h-3" />
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><div className="flex items-center gap-2"><Layers className="w-4 h-4 text-accent" /><div><p className="text-lg font-bold">{getActiveModuleCount()}</p><p className="text-xs text-muted-foreground">Active Modules</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="flex items-center gap-2"><Database className="w-4 h-4 text-accent" /><div><p className="text-lg font-bold">{getTotalEventCount()}</p><p className="text-xs text-muted-foreground">Total Events</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="flex items-center gap-2"><Type className="w-4 h-4 text-accent" /><div><p className="text-lg font-bold">{ALL_EVENTS.reduce((sum, e) => sum + e.fields.length, 0)}</p><p className="text-xs text-muted-foreground">Exposed Fields</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="flex items-center gap-2"><ListTree className="w-4 h-4 text-accent" /><div><p className="text-lg font-bold">{new Set(ALL_EVENTS.flatMap(e => e.fields.map(f => f.key))).size}</p><p className="text-xs text-muted-foreground">Unique Fields</p></div></div></CardContent></Card>
      </div>

      <div className="space-y-6">
        {filteredCategories.map(cat => {
          const CatIcon = ICONS[cat.icon] || Database;
          return (
            <div key={cat.key} className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${cat.color}`}>
                  <CatIcon className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-sm font-bold tracking-tight">{cat.label}</h2>
                <span className="text-xs text-muted-foreground">({cat.modules.length} modules)</span>
              </div>
              <div className="space-y-3">
                {cat.modules.map(mod => {
                  const Icon = ICONS[mod.icon] || Database;
                  const isExpanded = expandedModules.has(mod.moduleKey);
                  return (
                    <Card key={mod.moduleKey}>
                      <CardHeader className="pb-3">
                        <button
                          onClick={() => toggleModule(mod.moduleKey)}
                          className="flex items-center justify-between w-full text-left select-none"
                        >
                          <div className="flex items-center gap-2">
                            {mod.reserved ? (
                              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40" />
                            ) : isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mod.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <CardTitle className="text-sm flex items-center gap-2">
                                {mod.module}
                                {mod.reserved && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-medium">Reserved</span>}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">{mod.events.length} event{mod.events.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </button>
                      </CardHeader>
                      {isExpanded && !mod.reserved && (
                        <CardContent className="pt-0 space-y-2">
                          {mod.events.map(evt => (
                            <div key={evt.eventKey} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold">{evt.event}</span>
                                    <code className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground">{evt.eventKey}</code>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">{evt.description}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {evt.fields.map(field => {
                                  const FieldTypeIcon = FIELD_TYPE_ICONS[field.type] || Type;
                                  return (
                                    <span
                                      key={field.key}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${FIELD_TYPE_COLORS[field.type] || 'text-slate-600 bg-slate-50'}`}
                                      title={`${field.label} (${field.type})`}
                                    >
                                      <FieldTypeIcon className="w-2.5 h-2.5" />
                                      {field.label}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      )}
                      {isExpanded && mod.reserved && (
                        <CardContent className="pt-0">
                          <p className="text-xs text-muted-foreground italic p-3 bg-muted/30 rounded-lg border border-dashed">
                            This module is reserved for a future release. No events are available yet.
                          </p>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {filteredCategories.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No events match your search.</CardContent></Card>
      )}
    </div>
  );
}
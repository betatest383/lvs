import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Cog, HelpCircle, Wrench, Package, Radio } from 'lucide-react';
import RuleRegistry from '@/pages/rulesengine/RuleRegistry';
import QuestionsManager from '../../components/admin/QuestionsManager';
import RepairsManager from '../../components/admin/RepairsManager';
import MaterialsManager from '../../components/admin/MaterialsManager';
import AvailableEventsPage from './AvailableEventsPage';

export default function RulesEnginePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inspection Logic Rules</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage automation rules, inspection questions, repairs, and materials.</p>
      </div>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="rules" className="gap-1.5"><Cog className="w-3.5 h-3.5" /> Logic Rules</TabsTrigger>
          <TabsTrigger value="questions" className="gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> Questions</TabsTrigger>
          <TabsTrigger value="repairs" className="gap-1.5"><Wrench className="w-3.5 h-3.5" /> Repairs</TabsTrigger>
          <TabsTrigger value="materials" className="gap-1.5"><Package className="w-3.5 h-3.5" /> Materials</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><Radio className="w-3.5 h-3.5" /> Available Events</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <RuleRegistry />
        </TabsContent>

        <TabsContent value="questions">
          <QuestionsManager />
        </TabsContent>

        <TabsContent value="repairs">
          <RepairsManager />
        </TabsContent>

        <TabsContent value="materials">
          <MaterialsManager />
        </TabsContent>

        <TabsContent value="events">
          <AvailableEventsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
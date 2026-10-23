import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ModifierCategoryManager from '@/components/admin/pricing/ModifierCategoryManager';
import ModifierManager from '@/components/admin/pricing/ModifierManager';

export default function PricingModifierRegistry() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pricing Modifier Registry</h1>
        <p className="text-muted-foreground">Manage pricing modifier categories and individual modifiers for the Dynamic Price Builder.</p>
      </div>
      <Tabs defaultValue="modifiers">
        <TabsList>
          <TabsTrigger value="modifiers">Pricing Modifiers</TabsTrigger>
          <TabsTrigger value="categories">Modifier Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="modifiers" className="mt-4">
          <ModifierManager />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <ModifierCategoryManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
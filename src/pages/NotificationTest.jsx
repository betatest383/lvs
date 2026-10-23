import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { notify, isDevMode, setDevMode } from "@/lib/notify";
import { CheckCircle2, Info, AlertTriangle, XCircle, List, AlignLeft, Bug } from "lucide-react";

export default function NotificationTest() {
  const [devMode, setDevModeState] = useState(isDevMode());

  const toggleDevMode = (checked) => {
    setDevMode(checked);
    setDevModeState(checked);
    notify.info(`Developer mode ${checked ? "enabled" : "disabled"}.`, {
      sourceModule: "Notification Test",
      trigger: "toggle",
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notification Framework Test</h1>
        <p className="text-muted-foreground mt-1">
          Test the LVC OS enterprise notification system across all scenarios.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Notifications</CardTitle>
          <CardDescription>Each type auto-dismisses in 5 seconds. Hover to pause.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => notify.success("Equipment updated successfully.", { sourceModule: "Equipment" })}>
            <CheckCircle2 className="h-4 w-4" /> Show Success
          </Button>
          <Button variant="outline" onClick={() => notify.info("New policy available for review.", { sourceModule: "Policies" })}>
            <Info className="h-4 w-4" /> Show Info
          </Button>
          <Button variant="outline" onClick={() => notify.warning("Truck inspection expires in 3 days.", { sourceModule: "Fleet" })}>
            <AlertTriangle className="h-4 w-4" /> Show Warning
          </Button>
          <Button variant="destructive" onClick={() => notify.error("Unable to save equipment.", { sourceModule: "Equipment" })}>
            <XCircle className="h-4 w-4" /> Show Error
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advanced Scenarios</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => notify.info("This is a long message that demonstrates how the notification handles extended text content without breaking the layout or truncating important information that the user needs to see.", { sourceModule: "Test" })}>
            <AlignLeft className="h-4 w-4" /> Show Long Message
          </Button>
          <Button variant="secondary" onClick={() => {
            for (let i = 1; i <= 10; i++) {
              setTimeout(() => notify.info(`Notification ${i} of 10`, { sourceModule: "Stack Test" }), i * 150);
            }
          }}>
            <List className="h-4 w-4" /> Show 10 Notifications
          </Button>
          <Button variant="destructive" onClick={() => notify.error("Unable to save Equipment.", {
            details: "Duplicate Equipment ID. The ID 'EQ-000001' already exists in the system. Please use a unique identifier.",
            sourceModule: "Equipment",
            trigger: "save_error",
          })}>
            <Bug className="h-4 w-4" /> Show Expandable Error
          </Button>
          <Button onClick={() => notify.success("Inventory Updated", {
            details: { Added: 10, Available: 52, Assigned: 14, Retired: 0 },
            sourceModule: "Inventory",
            trigger: "receive_purchase",
          })}>
            <CheckCircle2 className="h-4 w-4" /> Success with Details
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Developer Mode</CardTitle>
          <CardDescription>Shows notification ID, source module, timestamp, trigger, dismiss method, and lifetime.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch checked={devMode} onCheckedChange={toggleDevMode} id="dev-mode" />
          <Label htmlFor="dev-mode">Enable Developer Mode</Label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> X button closes individual notifications</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Auto-dismiss works after 5 seconds</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Hovering pauses the auto-dismiss timer</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Multiple notifications stack correctly</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Newest notification appears at top</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Esc key dismisses focused notification</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Smooth fade-in / fade-out animations</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Expandable Details sections work</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Developer mode shows metadata</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
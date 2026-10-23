import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Webhook, Copy, Check, Settings as SettingsIcon, Shield, Link2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { INTEGRATION_ROLES } from "@/lib/servicetitanConstants";

export default function IntegrationSettings() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [autoRetry, setAutoRetry] = useState(true);
  const [notifyOnFail, setNotifyOnFail] = useState(true);

  // The webhook endpoint URL is derived from the function name
  const webhookUrl = `${window.location.origin}/api/functions/servicetitanWebhook`;

  const canAccess = user && INTEGRATION_ROLES.includes(user.role);

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!canAccess) {
    return (
      <div className="p-4 md:p-6">
        <Card className="border-red-200">
          <CardContent className="p-8 text-center">
            <Shield className="h-10 w-10 mx-auto mb-3 text-red-500" />
            <h2 className="text-lg font-bold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground mt-1">Only Admin, Owner, Director of Operations, and Operations Manager can access integration settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Integration Settings</h1>
        <p className="text-muted-foreground text-sm">Configure ServiceTitan webhook integration</p>
      </div>

      {/* Webhook Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Webhook className="h-5 w-5" /> Webhook Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Configure ServiceTitan to send webhook events to this endpoint. Append your webhook secret as a query parameter.</p>
          <div>
            <Label className="text-xs">Endpoint URL</Label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Full URL with Secret</Label>
            <Input readOnly value={`${webhookUrl}?secret=YOUR_SECRET_HERE`} className="font-mono text-xs mt-1" />
          </div>
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-3">
              <p className="text-xs text-amber-800">
                <strong>Setup required:</strong> Set the <code className="bg-amber-100 px-1 rounded">SERVICETITAN_WEBHOOK_SECRET</code> environment variable in your dashboard settings. This secret must match the <code className="bg-amber-100 px-1 rounded">?secret=</code> parameter in the URL above.
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Automation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><SettingsIcon className="h-5 w-5" /> Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-retry Failed Syncs</Label>
              <p className="text-xs text-muted-foreground">Automatically retry failed events up to 3 times</p>
            </div>
            <Switch checked={autoRetry} onCheckedChange={setAutoRetry} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Notify on Failures</Label>
              <p className="text-xs text-muted-foreground">Show alerts on dashboard when syncs fail</p>
            </div>
            <Switch checked={notifyOnFail} onCheckedChange={setNotifyOnFail} />
          </div>
        </CardContent>
      </Card>

      {/* Access Control */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-5 w-5" /> Access Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Admin, Owner, Director, Ops Manager</span>
            <span className="text-xs text-green-600">Full access — settings, mapping rules, failed syncs</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Warehouse Associate, Inventory Specialist</span>
            <span className="text-xs text-blue-600">View transfer sheets (warehouse scope) — no settings</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Technicians</span>
            <span className="text-xs text-muted-foreground">View transfer sheets assigned to their truck/job only</span>
          </div>
        </CardContent>
      </Card>

      {/* Supported Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-5 w-5" /> Supported Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {['Transfer Sheet Created/Updated', 'Job Created/Updated/Completed', 'Purchase Order Created/Received', 'Inventory Transfer Created', 'Appointment Assigned', 'Estimate Approved', 'Invoice Completed', 'Payment Collected', 'Customer Updated', 'Technician Assigned', 'Truck Assigned'].map(ev => (
              <div key={ev} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span>{ev}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Additional event types can be added without schema changes — every webhook becomes a permanent IntegrationEvent record.</p>
        </CardContent>
      </Card>
    </div>
  );
}
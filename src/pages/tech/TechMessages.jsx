import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Bell, Loader2 } from 'lucide-react';
import moment from 'moment';
import { useEmployeeContext } from '@/hooks/useEmployeeContext';
import { useMyNotifications } from '@/hooks/useMyNotifications';

const TYPE_COLORS = {
  Information: 'bg-blue-100 text-blue-700',
  Reminder: 'bg-amber-100 text-amber-700',
  Warning: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
  Success: 'bg-green-100 text-green-700',
  Operational: 'bg-purple-100 text-purple-700',
  Safety: 'bg-red-100 text-red-700',
  System: 'bg-slate-100 text-slate-600',
};

export default function TechMessages() {
  const { employee, isImpersonating } = useEmployeeContext();
  const { filteredNotifications: messages, loading } = useMyNotifications(employee);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">Company announcements and messages sent to you</p>
      </div>

      {messages.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No messages yet</p>
            <p className="text-xs mt-1">Company announcements and notifications will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map(msg => (
            <Card key={msg.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{msg.title}</p>
                      {msg.notification_type && (
                        <Badge className={`text-xs ${TYPE_COLORS[msg.notification_type] || 'bg-slate-100 text-slate-600'}`}>
                          {msg.notification_type}
                        </Badge>
                      )}
                      {msg.priority === 'Critical' && (
                        <Badge className="text-xs bg-red-500 text-white">Critical</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{msg.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {msg.sent_date ? moment(msg.sent_date).format('MMM D, h:mm A') : ''}
                      {msg.source_module && ` · ${msg.source_module}`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isImpersonating && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-3 text-xs text-amber-800 flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" />
            Data source — EnterpriseNotification filtered by recipient_email/role/department via useMyNotifications hook.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
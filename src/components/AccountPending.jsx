import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, UserPlus, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AccountPending({ user, isAdmin }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isAdmin ? 'bg-amber-100' : 'bg-blue-100'}`}>
            {isAdmin ? <UserPlus className="w-8 h-8 text-amber-600" /> : <Clock className="w-8 h-8 text-blue-600" />}
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {isAdmin ? 'Account Linking Required' : 'Account Pending Administrator Assignment'}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {isAdmin
                ? 'Your account is not yet linked to an Employee Registry record. As an administrator, you can link your account now.'
                : 'Your account has not been linked to an employee record yet. Please contact your administrator to complete the setup.'}
            </p>
          </div>
          <div className="bg-muted rounded-md px-4 py-2 text-sm">
            <p className="text-muted-foreground">Logged in as</p>
            <p className="font-medium">{user?.email}</p>
          </div>
          {isAdmin && (
            <Button onClick={() => navigate('/admin/user-identity')}>
              <UserPlus className="w-4 h-4" />
              Go to User Identity Management
            </Button>
          )}
          <Button variant="outline" onClick={() => { window.location.href = '/'; }}>
            <ShieldAlert className="w-4 h-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
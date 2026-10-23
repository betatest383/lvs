import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Loader2, Mail, Send } from 'lucide-react';
import DataTable from '../../components/shared/DataTable';

const statusColor = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  execution_plan: 'bg-indigo-100 text-indigo-700',
  ready_for_presentation: 'bg-cyan-100 text-cyan-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  ready_for_scheduling: 'bg-purple-100 text-purple-700',
};

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState([]);
  const [gmailTestRunning, setGmailTestRunning] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState(null);
  const [sendingEstimateId, setSendingEstimateId] = useState(null);
  const [estimateSendResult, setEstimateSendResult] = useState(null);

  useEffect(() => {
    base44.entities.Estimate.list('-created_date', 100).then(setEstimates);
  }, []);

  const sendGmailConnectionTest = async () => {
    setGmailTestRunning(true);
    setGmailTestResult(null);

    try {
      const response = await base44.functions.invoke('sendGmailConnectionTest', {});
      const result = response?.data || {};
      setGmailTestResult({ ok: true, ...result });
    } catch (error) {
      const result = error?.response?.data || error?.data || {};
      setGmailTestResult({
        ok: false,
        stage: result.stage || 'request',
        error: result.error || error?.message || 'The Gmail connection test failed',
      });
    } finally {
      setGmailTestRunning(false);
    }
  };

  const sendEstimateToIntegration = async (estimate) => {
    const trimmedName = (estimate.estimate_name || '').toString().trim();
    if (!trimmedName) {
      window.alert('Enter an Estimate Name before saving or sending this estimate.');
      return;
    }
    const confirmed = window.confirm(
      `Email the approved estimate for ${estimate.customer_name || 'this customer'} to the ServiceTitan integration inbox?`,
    );
    if (!confirmed) return;

    setSendingEstimateId(estimate.id);
    setEstimateSendResult(null);
    try {
      const response = await base44.functions.invoke('sendEstimateToGmail', {
        estimate_id: estimate.id,
      });
      const result = response?.data || {};
      setEstimateSendResult({ ok: true, ...result });
    } catch (error) {
      const result = error?.response?.data || error?.data || {};
      setEstimateSendResult({
        ok: false,
        stage: result.stage || 'request',
        error: result.error || error?.message || 'The estimate email failed',
        idempotency_key: result.idempotency_key || null,
      });
    } finally {
      setSendingEstimateId(null);
    }
  };

  const columns = [
    { key: 'customer_name', label: 'Customer', render: r => (
      <Link to={`/admin/estimates/${r.id}`} className="font-medium text-accent hover:underline">
        {r.customer_name || '—'}
      </Link>
    )},
    { key: 'estimate_name', label: 'Estimate Name', render: r => (
      <span className="text-sm font-medium whitespace-nowrap">{r.estimate_name ? r.estimate_name : <span className="text-muted-foreground italic">No name</span>}</span>
    )},
    { key: 'total', label: 'Total', render: r => r.total ? `$${r.total.toFixed(2)}` : '—' },
    { key: 'scope', label: 'Scope of Work', render: r => {
      const complete = r.total_job_days > 0;
      return (
        <Link to={`/admin/estimates/${r.id}`}>
          <Button size="sm" variant={complete ? 'default' : 'outline'} className="h-7 text-xs gap-1">
            {complete ? <><CheckCircle2 className="w-3 h-3" /> Complete</> : <><AlertTriangle className="w-3 h-3" /> Plan Scope</>}
          </Button>
        </Link>
      );
    }},
    { key: 'valid_until', label: 'Valid Until' },
    { key: 'status', label: 'Status', render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[r.status] || ''}`}>{r.status?.replace(/_/g, ' ')}</span>
    )},
    { key: 'integration', label: 'Integration', render: r => {
      const eligible = ['approved', 'sent', 'accepted'].includes(r.status);
      const hasName = !!(r.estimate_name || '').toString().trim();
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={hasName ? 'gap-1' : 'gap-1 border-amber-300 text-amber-700 hover:bg-amber-50'}
          disabled={!eligible || sendingEstimateId === r.id}
          title={!eligible
            ? 'Estimate must be approved, sent, or accepted'
            : !hasName ? 'Enter an Estimate Name before sending' : 'Email structured estimate data'}
          onClick={event => {
            event.stopPropagation();
            sendEstimateToIntegration(r);
          }}
        >
          {sendingEstimateId === r.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {sendingEstimateId === r.id ? 'Sending…' : 'Email to Integration'}
        </Button>
      );
    }},
  ];

  return (
    <div className="space-y-4" data-integration-bridge-version="1">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Estimate Integration Tools</h1>
        <p className="text-sm text-slate-600">
          Send an approved LVC OS estimate to the dedicated Gmail integration inbox.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={sendGmailConnectionTest}
          disabled={gmailTestRunning}
        >
          {gmailTestRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          {gmailTestRunning ? 'Sending Gmail Test…' : 'Send Gmail Connection Test'}
        </Button>
        <span className="text-sm text-slate-500">
          Sends only to lvcostitan@gmail.com. Zapier and ServiceTitan are not involved.
        </span>
      </div>

      {gmailTestResult && (
        <div
          role="status"
          className={`rounded-lg border p-4 text-sm ${
            gmailTestResult.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {gmailTestResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              <p className="font-semibold">
                {gmailTestResult.ok ? 'Gmail accepted the test message' : 'Gmail test failed'}
              </p>
              {gmailTestResult.ok ? (
                <>
                  <p>Subject: {gmailTestResult.subject}</p>
                  <p>Recipient: {gmailTestResult.recipient}</p>
                  <p>Google message ID: {gmailTestResult.gmail_message_id || 'not returned'}</p>
                </>
              ) : (
                <>
                  <p>Failed stage: {gmailTestResult.stage}</p>
                  <p>{gmailTestResult.error}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {estimateSendResult && (
        <div
          role="status"
          className={`rounded-lg border p-4 text-sm ${
            estimateSendResult.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <p className="font-semibold">
            {estimateSendResult.ok
              ? 'Structured estimate email accepted by Gmail'
              : 'Structured estimate email failed'}
          </p>
          {estimateSendResult.ok ? (
            <>
              <p>ServiceTitan Job ID / subject: {estimateSendResult.service_titan_job_id}</p>
              <p>Google message ID: {estimateSendResult.gmail_message_id}</p>
              <p>Sold By ID: {estimateSendResult.sold_by_id}</p>
              <p>Duplicate-prevention key: {estimateSendResult.idempotency_key}</p>
              <p>PDF included: No — PDF delivery is the next estimate step.</p>
            </>
          ) : (
            <>
              <p>Failed stage: {estimateSendResult.stage}</p>
              <p>{estimateSendResult.error}</p>
              {estimateSendResult.idempotency_key && (
                <p>Duplicate-prevention key: {estimateSendResult.idempotency_key}</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Estimate email bridge</p>
        <p>
          Email to Integration sends structured estimate data to lvcostitan@gmail.com.
          The email subject is the exact ServiceTitan Job ID. Nothing is sent automatically.
        </p>
      </div>

      <DataTable
        title="Estimates"
        subtitle="Manage repair estimates, Scope of Work Plans, and approved integration sends"
        columns={columns}
        data={estimates}
        searchFields={['customer_name', 'estimate_name']}
        emptyMessage="No estimates generated yet"
      />
    </div>
  );
}
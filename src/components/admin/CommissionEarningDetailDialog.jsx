import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, getCompensationMethodLabel, getCommissionBasisLabel, getEarningStatusLabel, getEarningStatusColor } from '@/lib/commissionEngine';

export default function CommissionEarningDetailDialog({ open, earning, onApprove, onReverse, onClose, canApprove }) {
  if (!earning) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Commission Earning Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Employee</span>
            <span className="font-medium">{earning.employee_name || earning.employee_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span>{earning.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Method</span>
            <span>{getCompensationMethodLabel(earning.compensation_method)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Basis</span>
            <span>{getCommissionBasisLabel(earning.commission_basis)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Commissionable Amount</span>
            <span>{formatCurrency(earning.commissionable_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Commission Rate</span>
            <span>{earning.commission_rate}%</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="text-muted-foreground">Calculated Amount</span>
            <span className="font-bold text-lg">{formatCurrency(earning.calculated_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEarningStatusColor(earning.status)}`}>
              {getEarningStatusLabel(earning.status)}
            </span>
          </div>
          {earning.earned_date && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Earned Date</span>
              <span>{new Date(earning.earned_date).toLocaleDateString()}</span>
            </div>
          )}
          {earning.adjustment_reason && (
            <div>
              <Label>Adjustment Reason</Label>
              <p className="text-xs mt-1 p-2 bg-muted rounded">{earning.adjustment_reason}</p>
            </div>
          )}
          {earning.approved_by && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Approved By</span>
              <span>{earning.approved_by}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {canApprove && earning.status === 'pending_completion' && (
            <Button onClick={() => onApprove(earning)} className="bg-green-600 hover:bg-green-700">
              Mark Earned
            </Button>
          )}
          {canApprove && (earning.status === 'earned' || earning.status === 'payable') && (
            <Button variant="destructive" onClick={() => onReverse(earning)}>
              Create Adjustment
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
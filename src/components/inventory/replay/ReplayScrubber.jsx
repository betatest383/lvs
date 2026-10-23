import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronsLeft, ChevronLeft, Play, Pause, Rewind,
  ChevronRight, ChevronsRight,
} from 'lucide-react';
import { getTimelineEventMeta } from '@/lib/inventoryTimelineConstants';

/**
 * Enhanced timeline scrubber with:
 * - Jump to Beginning / Present
 * - Step Forward / Backward
 * - Play Forward / Backward (auto-advance every 1.5s)
 * - Current position display with event type and timestamp
 */
export default function ReplayScrubber({ sortedTxns, scrubberIndex, onIndexChange }) {
  const [playDirection, setPlayDirection] = useState(null); // 'forward' | 'backward' | null
  const timerRef = useRef(null);

  const currentTxn = scrubberIndex > 0 && scrubberIndex <= sortedTxns.length ? sortedTxns[scrubberIndex - 1] : null;
  const meta = currentTxn ? getTimelineEventMeta(currentTxn.transaction_type) : null;
  const Icon = meta?.icon;

  useEffect(() => {
    if (!playDirection) return;
    timerRef.current = setInterval(() => {
      if (playDirection === 'forward') {
        onIndexChange(prev => {
          if (prev >= sortedTxns.length) { setPlayDirection(null); return prev; }
          return prev + 1;
        });
      } else {
        onIndexChange(prev => {
          if (prev <= 0) { setPlayDirection(null); return prev; }
          return prev - 1;
        });
      }
    }, 1500);
    return () => clearInterval(timerRef.current);
  }, [playDirection, sortedTxns.length, onIndexChange]);

  const togglePlayForward = () => {
    if (playDirection === 'forward') setPlayDirection(null);
    else setPlayDirection('forward');
  };
  const togglePlayBackward = () => {
    if (playDirection === 'backward') setPlayDirection(null);
    else setPlayDirection('backward');
  };

  const prevTxn = scrubberIndex > 1 ? sortedTxns[scrubberIndex - 2] : null;
  const nextTxn = scrubberIndex < sortedTxns.length ? sortedTxns[scrubberIndex] : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Timeline Scrubber</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Controls */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" disabled={scrubberIndex <= 0} onClick={() => onIndexChange(0)} title="Jump to Beginning">
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={scrubberIndex <= 0} onClick={() => onIndexChange(scrubberIndex - 1)} title="Step Backward">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={scrubberIndex <= 0} onClick={togglePlayBackward} title="Play Backward" className={playDirection === 'backward' ? 'bg-primary text-primary-foreground' : ''}>
            <Rewind className="w-4 h-4" />
          </Button>
          <Button variant="default" size="icon" disabled={scrubberIndex >= sortedTxns.length} onClick={togglePlayForward} title="Play Forward" className={playDirection === 'forward' ? 'bg-accent text-accent-foreground' : ''}>
            {playDirection === 'forward' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" disabled={scrubberIndex >= sortedTxns.length} onClick={() => onIndexChange(scrubberIndex + 1)} title="Step Forward">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={scrubberIndex >= sortedTxns.length} onClick={() => onIndexChange(sortedTxns.length)} title="Jump to Present">
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Slider */}
        <div>
          <input
            type="range"
            min={0}
            max={sortedTxns.length}
            value={scrubberIndex}
            onChange={e => { setPlayDirection(null); onIndexChange(parseInt(e.target.value, 10)); }}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Beginning</span>
            <span className="font-medium text-center">
              {currentTxn
                ? `${meta.label} — ${currentTxn.transaction_date ? new Date(currentTxn.transaction_date).toLocaleString() : '—'}`
                : 'Before any transactions'}
            </span>
            <span>Present</span>
          </div>
        </div>

        {/* Position context */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border p-2">
            <p className="text-muted-foreground mb-0.5">Previous Event</p>
            {prevTxn ? (
              <p className="font-medium truncate">{getTimelineEventMeta(prevTxn.transaction_type).label}</p>
            ) : <p className="text-muted-foreground">—</p>}
          </div>
          <div className="rounded border p-2 bg-muted/30">
            <p className="text-muted-foreground mb-0.5">Current Position</p>
            <p className="font-medium">{scrubberIndex} of {sortedTxns.length}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground mb-0.5">Next Event</p>
            {nextTxn ? (
              <p className="font-medium truncate">{getTimelineEventMeta(nextTxn.transaction_type).label}</p>
            ) : <p className="text-muted-foreground">—</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
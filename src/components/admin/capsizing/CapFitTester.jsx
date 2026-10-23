import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FlaskConical, CheckCircle2, XCircle, ShieldX } from 'lucide-react';
import { CAP_MEASUREMENT_BASIS } from '@/lib/capQuestionIds';

/**
 * Cap Product Fit Tester
 *
 * Allows admins to test all four mount-type + shape combinations:
 *   1. Slip-In + Round (inner diameter)
 *   2. Slip-In + Rectangular (interior length × width)
 *   3. Exterior Bolt-On + Round (outer diameter)
 *   4. Exterior Bolt-On + Rectangular (exterior length × width)
 *
 * Also supports Crown-Mounted testing (crown measurements).
 *
 * Cross-basis matching is blocked by design:
 *   - Slip-In never sees exterior measurements
 *   - Exterior Bolt-On never sees interior measurements
 *   - Round products never match L×W inputs
 *   - Rectangular products never match diameter inputs
 */
export default function CapFitTester({ products }) {
  const [mountType, setMountType] = useState('bolt_on_exterior');
  const [shape, setShape] = useState('round');
  const [interiorDiameter, setInteriorDiameter] = useState('');
  const [exteriorDiameter, setExteriorDiameter] = useState('');
  const [interiorLength, setInteriorLength] = useState('');
  const [interiorWidth, setInteriorWidth] = useState('');
  const [exteriorLength, setExteriorLength] = useState('');
  const [exteriorWidth, setExteriorWidth] = useState('');
  const [crownLength, setCrownLength] = useState('');
  const [crownWidth, setCrownWidth] = useState('');
  const [crownDiameter, setCrownDiameter] = useState('');
  const [tileProjection, setTileProjection] = useState('');
  const [flueCount, setFlueCount] = useState('1');
  const [results, setResults] = useState(null);
  const [testing, setTesting] = useState(false);

  const isSlipIn = mountType === 'slip_in';
  const isBoltOnExterior = mountType === 'bolt_on_exterior' || mountType === 'bolt_on';
  const isCrownMounted = mountType === 'crown_mounted';
  const isRound = shape === 'round';

  // Determine which measurement basis is active based on mount type + shape
  let activeBasis = null;
  let activeLabel = '';
  if (isCrownMounted) {
    activeBasis = CAP_MEASUREMENT_BASIS.CROWN;
    activeLabel = 'Crown';
  } else if (isSlipIn && isRound) {
    activeBasis = CAP_MEASUREMENT_BASIS.INTERIOR_DIAMETER;
    activeLabel = 'Interior Diameter (Inner)';
  } else if (isSlipIn && !isRound) {
    activeBasis = CAP_MEASUREMENT_BASIS.INTERIOR_LENGTH_WIDTH;
    activeLabel = 'Interior Length × Width';
  } else if (isBoltOnExterior && isRound) {
    activeBasis = CAP_MEASUREMENT_BASIS.EXTERIOR_DIAMETER;
    activeLabel = 'Exterior Diameter (Outer)';
  } else if (isBoltOnExterior && !isRound) {
    activeBasis = CAP_MEASUREMENT_BASIS.EXTERIOR_LENGTH_WIDTH;
    activeLabel = 'Exterior Length × Width';
  }

  const handleTest = () => {
    setTesting(true);
    setResults(null);

    // Extract the measurement value for the active basis
    let testDiameter = 0;
    let testLength = 0;
    let testWidth = 0;
    let measurementProvided = false;

    if (activeBasis === CAP_MEASUREMENT_BASIS.INTERIOR_DIAMETER) {
      testDiameter = parseFloat(interiorDiameter) || 0;
      measurementProvided = testDiameter > 0;
    } else if (activeBasis === CAP_MEASUREMENT_BASIS.EXTERIOR_DIAMETER) {
      testDiameter = parseFloat(exteriorDiameter) || 0;
      measurementProvided = testDiameter > 0;
    } else if (activeBasis === CAP_MEASUREMENT_BASIS.INTERIOR_LENGTH_WIDTH) {
      testLength = parseFloat(interiorLength) || 0;
      testWidth = parseFloat(interiorWidth) || 0;
      measurementProvided = testLength > 0 && testWidth > 0;
    } else if (activeBasis === CAP_MEASUREMENT_BASIS.EXTERIOR_LENGTH_WIDTH) {
      testLength = parseFloat(exteriorLength) || 0;
      testWidth = parseFloat(exteriorWidth) || 0;
      measurementProvided = testLength > 0 && testWidth > 0;
    } else if (activeBasis === CAP_MEASUREMENT_BASIS.CROWN) {
      if (isRound) {
        testDiameter = parseFloat(crownDiameter) || 0;
        measurementProvided = testDiameter > 0;
      } else {
        testLength = parseFloat(crownLength) || 0;
        testWidth = parseFloat(crownWidth) || 0;
        measurementProvided = testLength > 0 && testWidth > 0;
      }
    }

    const proj = parseFloat(tileProjection) || 0;
    const flues = parseInt(flueCount) || 1;

    setTimeout(() => {
      if (!measurementProvided) {
        setResults({ error: `Measurement required: ${activeLabel} must be provided for this mount type + shape combination.` });
        setTesting(false);
        return;
      }

      const candidates = products.filter(p =>
        p.is_active !== false && p.mount_type === mountType
      );

      const matches = [];
      for (const p of candidates) {
        const reasons = [];
        const fails = [];

        if (isRound) {
          // Round diameter matching — no rotated matching
          if (p.compatible_shape !== 'round' && p.compatible_shape !== 'any') {
            fails.push(`Product shape is ${p.compatible_shape || 'any'} — round products only match round or universal shapes`);
            matches.push({ product: p, compatible: false, reasons, fails });
            continue;
          }
          if (!p.min_fitting_diameter && !p.max_fitting_diameter) {
            fails.push('Product has no diameter fitting range configured');
            matches.push({ product: p, compatible: false, reasons, fails });
            continue;
          }
          const minD = p.min_fitting_diameter || 0;
          const maxD = p.max_fitting_diameter || Infinity;
          const isExact = p.nominal_diameter && Math.abs(p.nominal_diameter - testDiameter) < 0.001;

          if (testDiameter >= minD && testDiameter <= maxD) {
            reasons.push(`${activeLabel} ${testDiameter}in fits within range ${minD}-${maxD === Infinity ? '∞' : maxD}in${isExact ? ' (exact nominal match)' : ''}`);
          } else {
            fails.push(`${activeLabel} ${testDiameter}in outside fitting range ${minD}-${maxD === Infinity ? '∞' : maxD}in`);
          }
        } else {
          // Rectangular L×W matching
          if (p.compatible_shape === 'round') {
            fails.push(`Product is round-only — cannot match a rectangular flue`);
            matches.push({ product: p, compatible: false, reasons, fails });
            continue;
          }
          const minL = p.min_fitting_length || 0;
          const maxL = p.max_fitting_length || Infinity;
          const minW = p.min_fitting_width || 0;
          const maxW = p.max_fitting_width || Infinity;

          const normalFit = testLength >= minL && testLength <= maxL && testWidth >= minW && testWidth <= maxW;
          const rotatedFit = p.allows_rotated_match && testWidth >= minL && testWidth <= maxL && testLength >= minW && testLength <= maxW;

          if (normalFit) {
            reasons.push(`${activeLabel} ${testLength}in × ${testWidth}in fits within range ${minL}-${maxL === Infinity ? '∞' : maxL} × ${minW}-${maxW === Infinity ? '∞' : maxW} (normal orientation)`);
          } else if (rotatedFit) {
            reasons.push(`Rotated fit: ${testLength}in × ${testWidth}in fits within range when rotated 90°`);
          } else {
            fails.push(`${activeLabel} ${testLength}in × ${testWidth}in outside fitting range ${minL}-${maxL === Infinity ? '∞' : maxL} × ${minW}-${maxW === Infinity ? '∞' : maxW}${p.allows_rotated_match ? ' (rotated also checked)' : ''}`);
          }
        }

        // Tile projection check (bolt-on exterior only)
        if (isBoltOnExterior && p.min_tile_projection) {
          if (proj >= p.min_tile_projection) {
            reasons.push(`Tile projection ${proj}in ≥ required ${p.min_tile_projection}in`);
          } else {
            fails.push(`Tile projection ${proj}in below required ${p.min_tile_projection}in`);
          }
        }

        // Flues supported check (crown-mounted only)
        if (isCrownMounted && p.flues_supported) {
          if (p.flues_supported >= flues) {
            reasons.push(`Supports ${flues} flue(s) (capacity: ${p.flues_supported})`);
          } else {
            fails.push(`Only supports ${p.flues_supported} flue(s), need ${flues}`);
          }
        }

        matches.push({
          product: p,
          compatible: fails.length === 0,
          reasons,
          fails,
        });
      }

      setResults({
        basis: activeBasis,
        basisLabel: activeLabel,
        mountType,
        shape,
        matches,
      });
      setTesting(false);
    }, 300);
  };

  // Determine which input fields to show based on active basis
  const showInteriorDiameter = activeBasis === CAP_MEASUREMENT_BASIS.INTERIOR_DIAMETER;
  const showExteriorDiameter = activeBasis === CAP_MEASUREMENT_BASIS.EXTERIOR_DIAMETER;
  const showInteriorLW = activeBasis === CAP_MEASUREMENT_BASIS.INTERIOR_LENGTH_WIDTH;
  const showExteriorLW = activeBasis === CAP_MEASUREMENT_BASIS.EXTERIOR_LENGTH_WIDTH;
  const showCrown = activeBasis === CAP_MEASUREMENT_BASIS.CROWN;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-accent" />
          <h3 className="font-semibold">Cap Product Fit Tester</h3>
        </div>

        {/* Active basis indicator */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            Basis: <span className="font-semibold ml-1">{activeLabel}</span>
          </Badge>
          <span className="text-xs text-muted-foreground">
            Cross-basis matching is blocked — only the active basis measurement is used.
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Mounting Method</Label>
            <Select value={mountType} onValueChange={setMountType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="slip_in">Slip-In (Interior)</SelectItem>
                <SelectItem value="bolt_on_exterior">Bolt-On (Exterior)</SelectItem>
                <SelectItem value="crown_mounted">Crown-Mounted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isCrownMounted && (
            <div>
              <Label className="text-xs">Flue Shape</Label>
              <Select value={shape} onValueChange={setShape}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round">Round</SelectItem>
                  <SelectItem value="rectangular">Rectangular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isCrownMounted && (
            <div>
              <Label className="text-xs">Crown Shape</Label>
              <Select value={shape} onValueChange={setShape}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round">Round</SelectItem>
                  <SelectItem value="rectangular">Rectangular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Interior diameter (slip-in + round) */}
          {showInteriorDiameter && (
            <div>
              <Label className="text-xs">Inner Diameter (in)</Label>
              <Input type="number" value={interiorDiameter} onChange={e => setInteriorDiameter(e.target.value)} placeholder="e.g. 8" />
            </div>
          )}

          {/* Exterior diameter (bolt-on exterior + round) */}
          {showExteriorDiameter && (
            <div>
              <Label className="text-xs">Outer Diameter (in)</Label>
              <Input type="number" value={exteriorDiameter} onChange={e => setExteriorDiameter(e.target.value)} placeholder="e.g. 10" />
            </div>
          )}

          {/* Interior L×W (slip-in + rectangular) */}
          {showInteriorLW && (
            <>
              <div>
                <Label className="text-xs">Interior Length (in)</Label>
                <Input type="number" value={interiorLength} onChange={e => setInteriorLength(e.target.value)} placeholder="e.g. 8" />
              </div>
              <div>
                <Label className="text-xs">Interior Width (in)</Label>
                <Input type="number" value={interiorWidth} onChange={e => setInteriorWidth(e.target.value)} placeholder="e.g. 12" />
              </div>
            </>
          )}

          {/* Exterior L×W (bolt-on exterior + rectangular) */}
          {showExteriorLW && (
            <>
              <div>
                <Label className="text-xs">Exterior Length (in)</Label>
                <Input type="number" value={exteriorLength} onChange={e => setExteriorLength(e.target.value)} placeholder="e.g. 10" />
              </div>
              <div>
                <Label className="text-xs">Exterior Width (in)</Label>
                <Input type="number" value={exteriorWidth} onChange={e => setExteriorWidth(e.target.value)} placeholder="e.g. 14" />
              </div>
            </>
          )}

          {/* Crown measurements (crown-mounted) */}
          {showCrown && isRound && (
            <div>
              <Label className="text-xs">Crown Diameter (in)</Label>
              <Input type="number" value={crownDiameter} onChange={e => setCrownDiameter(e.target.value)} placeholder="e.g. 36" />
            </div>
          )}
          {showCrown && !isRound && (
            <>
              <div>
                <Label className="text-xs">Crown Length (in)</Label>
                <Input type="number" value={crownLength} onChange={e => setCrownLength(e.target.value)} placeholder="e.g. 36" />
              </div>
              <div>
                <Label className="text-xs">Crown Width (in)</Label>
                <Input type="number" value={crownWidth} onChange={e => setCrownWidth(e.target.value)} placeholder="e.g. 48" />
              </div>
            </>
          )}

          {isBoltOnExterior && (
            <div>
              <Label className="text-xs">Tile Projection (in)</Label>
              <Input type="number" value={tileProjection} onChange={e => setTileProjection(e.target.value)} placeholder="e.g. 5" />
            </div>
          )}
          {isCrownMounted && (
            <div>
              <Label className="text-xs">Number of Flues</Label>
              <Input type="number" value={flueCount} onChange={e => setFlueCount(e.target.value)} placeholder="e.g. 1" />
            </div>
          )}
        </div>

        {/* Cross-basis blocking indicator */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
          <ShieldX className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            {isSlipIn && <span>Slip-In uses <strong>interior</strong> measurements only. Exterior fields are hidden and never used.</span>}
            {isBoltOnExterior && <span>Exterior bolt-on uses <strong>exterior</strong> measurements only. Interior fields are hidden and never used.</span>}
            {isCrownMounted && <span>Crown-mounted uses <strong>crown</strong> measurements only. Flue interior/exterior are never used.</span>}
          </div>
        </div>

        <Button onClick={handleTest} disabled={testing || products.length === 0}>
          {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-2" />}
          Test Product Fit
        </Button>

        {products.length === 0 && (
          <p className="text-sm text-muted-foreground">Add cap products before testing fit.</p>
        )}

        {results?.error && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 flex items-start gap-2">
            <ShieldX className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{results.error}</p>
          </div>
        )}

        {results && !results.error && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {results.matches.filter(r => r.compatible).length} compatible · {results.matches.filter(r => !r.compatible).length} incompatible
            </p>
            {results.matches.map((r, idx) => (
              <div key={idx} className={`border rounded-lg p-3 ${r.compatible ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {r.compatible ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    <span className="font-medium text-sm">{r.product.matrix_name}</span>
                  </div>
                  <div className="flex gap-1">
                    {r.product.is_preferred && <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">Preferred</Badge>}
                    <Badge variant="outline" className="text-[10px]">{r.product.mount_type === 'slip_in' ? 'Slip-In' : r.product.mount_type === 'crown_mounted' ? 'Crown-Mounted' : 'Bolt-On (Exterior)'}</Badge>
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {r.reasons.map((reason, i) => (
                    <p key={i} className="text-xs text-green-700 flex items-start gap-1">
                      <span className="text-green-600">✓</span> {reason}
                    </p>
                  ))}
                  {r.fails.map((fail, i) => (
                    <p key={i} className="text-xs text-red-600 flex items-start gap-1">
                      <span className="text-red-500">✗</span> {fail}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
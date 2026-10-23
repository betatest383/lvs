import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Grid3x3, Ruler, Layers, AlertCircle } from 'lucide-react';

/**
 * Displays all required calculated outputs from the Crown Calculation.
 */
export default function CrownCalculationResults({ calc, removingBrickCourses, crownStepIn }) {
  if (!calc || !calc.concrete_bags_required) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Enter crown dimensions and flue measurements to see calculated results.
        </CardContent>
      </Card>
    );
  }

  const fmt = (n, decimals = 2) => Number(n).toFixed(decimals);

  return (
    <div className="space-y-3">
      {/* Primary required outputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ResultCard
          icon={<Package className="w-5 h-5 text-blue-600" />}
          label="Bags of Concrete Needed"
          value={calc.concrete_bags_required}
          unit="bags"
          detail={`${fmt(calc.concrete_cubic_feet, 4)} cu ft ÷ ${fmt(calc.raw_concrete_bags / calc.concrete_cubic_feet || 0.6, 2)} yield = ${fmt(calc.raw_concrete_bags, 4)} raw → ${calc.concrete_bags_required} bags`}
        />
        <ResultCard
          icon={<Grid3x3 className="w-5 h-5 text-green-600" />}
          label="Size of Wire Grid"
          value={`${calc.wire_grid_length} × ${calc.wire_grid_width}`}
          unit="inches"
          detail="Crown dimensions minus 2 inches each side"
        />
        <ResultCard
          icon={<Ruler className="w-5 h-5 text-orange-600" />}
          label="Expansion Foam Length"
          value={`${fmt(calc.total_foam_inches, 2)} in`}
          unit={`(${fmt(calc.total_foam_linear_feet, 2)} linear ft)`}
          detail={`${calc.foam_purchase_quantity} package${calc.foam_purchase_quantity !== 1 ? 's' : ''} needed`}
        />
        <ResultCard
          icon={<Layers className="w-5 h-5 text-purple-600" />}
          label="Crown Form Size — Width"
          value={calc.crown_form_size_width}
          unit=""
          detail="Based on crown form width classification"
        />
        <ResultCard
          icon={<Layers className="w-5 h-5 text-purple-600" />}
          label="Crown Form Size — Length"
          value={calc.crown_form_size_length}
          unit=""
          detail="Based on crown form length classification"
        />
      </div>

      {/* Boolean outputs */}
      <div className="grid grid-cols-2 gap-3">
        <Card className={removingBrickCourses ? 'border-amber-400 bg-amber-50' : 'border-green-200 bg-green-50'}>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <AlertCircle className={`w-5 h-5 ${removingBrickCourses ? 'text-amber-600' : 'text-green-600'}`} />
            <div>
              <p className="text-xs text-muted-foreground">Removing Brick Courses?</p>
              <p className="text-sm font-semibold">{removingBrickCourses ? 'Yes' : 'No'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={crownStepIn ? 'border-amber-400 bg-amber-50' : 'border-green-200 bg-green-50'}>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <AlertCircle className={`w-5 h-5 ${crownStepIn ? 'text-amber-600' : 'text-green-600'}`} />
            <div>
              <p className="text-xs text-muted-foreground">Will the Crown Step In?</p>
              <p className="text-sm font-semibold">{crownStepIn ? 'Yes' : 'No'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Intermediate calculations (for transparency) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Intermediate Calculations</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Gross Crown Area</p>
            <p className="font-medium">{fmt(calc.gross_crown_area)} sq in</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Flue Area</p>
            <p className="font-medium">{fmt(calc.total_flue_area)} sq in</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net Crown Area</p>
            <p className="font-medium">{fmt(calc.net_crown_area)} sq in</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Concrete Volume</p>
            <p className="font-medium">{fmt(calc.concrete_cubic_feet, 4)} cu ft</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Raw Bags (unrounded)</p>
            <p className="font-medium">{fmt(calc.raw_concrete_bags, 4)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Foam (unrounded)</p>
            <p className="font-medium">{fmt(calc.total_foam_inches, 4)} in</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Foam (linear ft)</p>
            <p className="font-medium">{fmt(calc.total_foam_linear_feet, 4)} ft</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Flue Count</p>
            <p className="font-medium">{calc.flue_count || (calc.flue_breakdown?.length || 0)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Per-flue breakdown */}
      {calc.flue_breakdown && calc.flue_breakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Per-Flue Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {calc.flue_breakdown.map((f) => (
                <div key={f.index} className="flex items-center justify-between text-sm border-b pb-1">
                  <span className="text-muted-foreground">Flue {f.index}: {f.length} × {f.width} in</span>
                  <span className="flex gap-4">
                    <span>Area: <span className="font-medium">{fmt(f.area)} sq in</span></span>
                    <span>Foam: <span className="font-medium">{f.foam_inches} in</span></span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultCard({ icon, label, value, unit, detail }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold">
              {value} {unit && <span className="text-sm font-normal text-muted-foreground">{unit}</span>}
            </p>
            {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
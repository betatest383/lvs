import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RotateCw, Star, Package } from "lucide-react";

/**
 * Displays a single compatible cap product from the resolver.
 */
export default function CapProductCard({ product, isSelected, onSelect, disabled }) {
  if (!product) return null;

  const constructionLabel = [product.base_material, product.finish, product.finish_color]
    .filter(Boolean)
    .join(" / ");

  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-accent border-accent" : "hover:border-accent/50"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onClick={() => !disabled && onSelect?.(product)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{product.matrix_name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {product.manufacturer} {product.model}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {product.is_preferred && (
              <Badge variant="default" className="gap-1 text-xs">
                <Star className="h-3 w-3" /> Preferred
              </Badge>
            )}
            {isSelected && (
              <Badge variant="default" className="gap-1 text-xs bg-accent text-accent-foreground">
                <CheckCircle2 className="h-3 w-3" /> Selected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-1">
          <span className="text-muted-foreground">Construction:</span>
          <span className="font-medium capitalize">{constructionLabel || "—"}</span>
          <span className="text-muted-foreground">Nominal Size:</span>
          <span className="font-medium">
            {product.compatible_shape === 'round' || product.nominal_diameter
              ? `${product.nominal_diameter}" Ø${product.nominal_height ? ` × ${product.nominal_height}" H` : ''}`
              : `${product.nominal_length}" × ${product.nominal_width}"${product.nominal_height ? ` × ${product.nominal_height}"` : ''}`}
          </span>
          <span className="text-muted-foreground">SKU:</span>
          <span className="font-medium">{product.material_sku || "—"}</span>
          <span className="text-muted-foreground">Coverage:</span>
          <span className="font-medium capitalize">
            {(product.coverage_type || "").replace(/_/g, " ")}
          </span>
        </div>
        {product.match_orientation === "rotated" && (
          <Badge variant="secondary" className="gap-1">
            <RotateCw className="h-3 w-3" /> Rotated Fit
          </Badge>
        )}
        {product.measured_diameter && (
          <p className="text-[10px] text-muted-foreground">
            Measured Ø: {product.measured_diameter}" · Range: {product.min_fitting_diameter}"–{product.max_fitting_diameter}"
          </p>
        )}
        {product.finish === 'powder_coated' && (
          <div className="border-t pt-2 mt-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300">Powder-Coated</Badge>
              {product.finish_color && (
                <span className="text-xs capitalize">{product.finish_color}</span>
              )}
            </div>
            {(product.finish_material_id || product.finish_service_id) ? (
              <p className="text-[10px] text-muted-foreground mt-1">
                Finish {product.finish_material_id ? 'material' : ''} {product.finish_material_id && product.finish_service_id ? '+ ' : ''}
                {product.finish_service_id ? 'service' : ''} configured — color selected at proposal.
              </p>
            ) : (
              <p className="text-[10px] text-amber-600 mt-1">Finish material/service not configured for this product.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
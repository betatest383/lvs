import React from "react";
import { CHIMNEY_TEMPLATES } from "@/lib/chimneyDiagramConfig";
import ChimneyDiagram from "./ChimneyDiagram";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export default function DiagramSelector({ selectedTemplate, onSelect }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Select Chimney Diagram</h2>
        <p className="text-muted-foreground mt-1">
          Choose the diagram template that matches the chimney you are measuring.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.values(CHIMNEY_TEMPLATES).map(tmpl => {
          const isSelected = selectedTemplate === tmpl.key;
          return (
            <Card key={tmpl.key} className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:shadow-md"}`} onClick={() => onSelect(tmpl.key)}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  {tmpl.name}
                  {isSelected && <Check className="h-5 w-5 text-primary" />}
                </CardTitle>
                <CardDescription>{tmpl.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center bg-slate-50 rounded-lg p-4">
                  <ChimneyDiagram template={tmpl.key} sections={[]} interactive={false} size="sm" />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{tmpl.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tmpl.sections.map(s => (
                    <span key={s} className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                </div>
                <Button className="w-full mt-4" variant={isSelected ? "default" : "outline"} onClick={e => { e.stopPropagation(); onSelect(tmpl.key); }}>
                  {isSelected ? "Selected" : "Select"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
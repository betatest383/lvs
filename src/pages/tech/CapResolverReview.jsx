import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import CapMountingResolver from "@/components/cap/CapMountingResolver";

/**
 * Page wrapper for the Chimney Cap Mounting and Material Resolver.
 * Route: /tech/cap-resolver/:jobId
 */
export default function CapResolverReview() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <CapMountingResolver jobId={jobId} />
    </div>
  );
}
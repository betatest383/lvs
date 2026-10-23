/**
 * Shared technician resolution rules for ServiceTitan-imported Jobs/Appointments.
 *
 * Used by:
 *   - hydrateJobTechnicianAssignments  (admin/owner backfill tool)
 *   - resolveJobTechnicianOnImport      (live Job-create import hook)
 *
 * Resolution priority:
 *   1. Exact ServiceTitan technician ID  -> Technician.technician_id
 *   2. Exact normalized email             -> Technician.email / EmployeeRegistry.email
 *   3. Exact normalized full name         -> single unambiguous match only
 *
 * A match is only accepted when it resolves through one active Technician record
 * AND its linked active EmployeeRegistry email. Never creates a record.
 */

export interface ResolvedTechnician {
  technicianEntityId: string | null;
  employeeRegistryId: string;
  email: string;
  name: string;
}

export function normalizeText(s: any): string {
  return s == null ? "" : String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeEmail(s: any): string {
  return s == null ? "" : String(s).trim().toLowerCase();
}

export function isActiveEmployee(e: any): boolean {
  return e.employment_status !== "Terminated" && e.employment_status !== "Inactive";
}

export function resolveTechnician(
  technicians: any[],
  employees: any[],
  stTechId: string,
  techEmail: string,
  techName: string,
): ResolvedTechnician | null {
  // 1. Exact ServiceTitan technician ID -> Technician.technician_id
  if (stTechId) {
    const t = technicians.find(
      (x) => String(x.technician_id || "") === String(stTechId) && x.status !== "inactive",
    );
    if (t && t.email) {
      const er = employees.find(
        (e) => normalizeEmail(e.email) === normalizeEmail(t.email) && isActiveEmployee(e),
      );
      if (er) {
        return {
          technicianEntityId: t.id,
          employeeRegistryId: er.id,
          email: er.email || t.email,
          name: `${er.first_name} ${er.last_name}`.trim(),
        };
      }
    }
  }
  // 2. Exact normalized email
  if (techEmail) {
    const ne = normalizeEmail(techEmail);
    const er = employees.find((e) => normalizeEmail(e.email) === ne && isActiveEmployee(e));
    if (er) {
      const t = technicians.find((x) => normalizeEmail(x.email) === ne && x.status !== "inactive");
      return {
        technicianEntityId: t?.id || null,
        employeeRegistryId: er.id,
        email: er.email,
        name: `${er.first_name} ${er.last_name}`.trim(),
      };
    }
  }
  // 3. Exact normalized full name -- single unambiguous match only
  if (techName) {
    const nn = normalizeText(techName);
    const tMatches = technicians.filter(
      (x) => normalizeText(x.full_name) === nn && x.status !== "inactive",
    );
    if (tMatches.length === 1) {
      const t = tMatches[0];
      if (t.email) {
        const er = employees.find(
          (e) => normalizeEmail(e.email) === normalizeEmail(t.email) && isActiveEmployee(e),
        );
        if (er) {
          return {
            technicianEntityId: t.id,
            employeeRegistryId: er.id,
            email: er.email,
            name: `${er.first_name} ${er.last_name}`.trim(),
          };
        }
      }
    }
    const erMatches = employees.filter(
      (e) => normalizeText(`${e.first_name} ${e.last_name}`) === nn && isActiveEmployee(e),
    );
    if (erMatches.length === 1) {
      const er = erMatches[0];
      return {
        technicianEntityId: null,
        employeeRegistryId: er.id,
        email: er.email,
        name: `${er.first_name} ${er.last_name}`.trim(),
      };
    }
  }
  return null;
}

export function buildUnmatchedWarning(techName: string, stTechId: string): string {
  return `Unable to resolve technician '${techName || "N/A"}' (ST technician ID: ${stTechId || "N/A"}). No unique match in Technician/EmployeeRegistry.`;
}
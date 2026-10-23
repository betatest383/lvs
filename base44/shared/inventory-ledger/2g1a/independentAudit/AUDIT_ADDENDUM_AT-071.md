# 2G1-A Audit Addendum — AT-071 Owner Resolution

**Date:** 2026-07-23
**Authorization Source:** Project Owner
**Contract SHA-256:** `df9e621e1d201609aa24c808496763bd22b87a60b016fcda516ba06c0dedb544`

## Subject

Validation precedence ambiguity for E33 `job_material.consumed` when `job_custody_position_id` references a nonexistent position.

## Ambiguity

The approved contract Section 22 (test table) specifies AT-071's expected result as `VALIDATION.MISSING_SOURCE_POSITION`. However, the behavioral specification in Sections 5.16 and 14.12 describes the `JobIssueProgress` selection as the first step, which would produce `VALIDATION.MISSING_ISSUE_PROVENANCE` when no open issue is found — including cases where the referenced position does not exist.

## Owner Resolution

The owner has clarified the deterministic validation precedence for E33 as follows:

1. **First:** Validate that `job_custody_position_id` identifies an existing position in `DomainState.positions`.
2. **If the referenced position does not exist:** Reject with `VALIDATION.MISSING_SOURCE_POSITION`.
3. **If the position exists but no eligible open issue provenance exists** for the required `(item_id, job_custody_position_id)` pair: Reject with `VALIDATION.MISSING_ISSUE_PROVENANCE`.

## Authorized Expected Result

AT-071 retains its expected result: `VALIDATION.MISSING_SOURCE_POSITION`

## Scope

This is a narrow clarification of deterministic validation precedence for E33 only. It does not authorize changing any other test, requirement, event behavior, rejection code, or approved contract provision.

## Implementation Impact

The `processE33` function in `publicBoundary.ts` was modified to add a position existence check (`getPosition`) before the `findOpenIssue` call. This is the only code change resulting from this resolution.
# YouTube Delete Audit Report (2026-08-26)

## Verdict

**No evidence of successful accidental non-agent deletes.**

All IDs in `deleted_ok` across `v3_deleted_ids.json`, `v4_deleted_ids.json`, and `v5_deleted_ids.json` match the agent allowlist built from `pilot_uploads*.json` (+ prior remake manifests).

## Flags

### Medium — unknown IDs were *attempted* in V3
These IDs were in `v3_deleted_ids.json` `delete_attempts` but are **not** in pilot upload manifests:

`3J0DpJog8lU, 57J2W-9MFIA, 67PbipJQ9dg, I2FGdpDXGKc, MBdSWrKkDH4, VWVqSAR2OR8, eOulhjIk1xM, hYg1_l1tcEc, s4m2vSdDYVs, s9tA7bXDBO0`

Every attempt returned **HTTP 404** (already gone). None are live now. Future deletes of such IDs are blocked by the allowlist gate.

### Info — V4 deleted pre-guard
All 12 V4 pilots were deleted by a prior V5 remake (`v5_deleted_ids.json`). They were agent-owned. **View counts at delete time were not recorded.**

## Current live agent shorts

| ID | videoId | views | privacy | safe_to_delete |
|----|---------|-------|---------|----------------|
| DE-06 V5 | `nKfxYIV8Fzg` | 0 | unlisted | YES |

V4: all GONE. USA: no live agent shorts in recent uploads scan.

## Safe to delete (under new rules)

- Only `nKfxYIV8Fzg` among live agent shorts (views=0). Prefer leave unlisted unless remaking.

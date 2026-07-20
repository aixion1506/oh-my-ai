# wshsearchprobe reference notes

Scan probe document for FX-WSH-100. It exists so the fixture can prove that a
content scan really ran, instead of trusting an empty result.

## Decisions

- decision: wshsearchprobe keeps its own queue rather than sharing the global one.
- rationale: the shared queue could not express per-tenant ordering.
- trade-off: more memory per tenant, in exchange for predictable ordering.

## Risks

- risk: a wshsearchprobe rollback needs the queue drained first.
- security: queue payloads may contain tenant identifiers.
- migration: existing queue entries have no tenant column yet.

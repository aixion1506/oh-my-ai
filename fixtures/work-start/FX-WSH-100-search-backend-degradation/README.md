# FX-WSH-100 — Search backend degradation

Work-start's Decision/Risk extraction used to call `rg` and discard its failure. On a
machine without ripgrep every scan silently returned nothing, and the artifact then
asserted:

```text
No decision candidates were found.
No risk candidates were found.
```

That is a false absence: nothing had been searched. A human reviewing the handoff would
read "no risks" when the risks were simply never looked at.

This fixture pins the three backend states against `input/decision-source.md`, a probe
document that genuinely contains decision and risk lines.

| Backend | `degraded` | `content_scan` | Decision candidates | Absence claim |
|---------|-----------|----------------|---------------------|---------------|
| `rg` | `false` | `scanned` | non-empty | allowed |
| `grep` (fallback) | `true` | `scanned` | non-empty | allowed, marked degraded |
| none | `true` | `scan_unavailable` | empty | **forbidden** |

The `none` case must still exit 0 and must never print "No decision candidates were
found" — an unavailable scan is reported as unavailable, not as absence.

Truthfulness contract: *scan not performed* ≠ *nothing found*.

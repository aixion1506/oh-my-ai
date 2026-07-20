# FX-INS-040 — Dangling link recovery guidance

Doctor must not print recovery guidance that cannot actually recover the install.

`make install-shared` only relinks when the managed **source** still exists. When the
source is gone it skips the path, so recommending it there leaves the user stuck in a
permanently failing `doctor --strict`.

This fixture pins both branches and, more importantly, checks that *following the
printed guidance* clears the failure.

| Case | Source state | Expected guidance | After following it |
|------|--------------|-------------------|--------------------|
| A | source exists | `make install-shared` to relink | `doctor --strict` exits 0 |
| B | source missing | `rm <dangling path>` (plus restore-source note) | `doctor --strict` exits 0 |

Related blocker: Doctor guidance was previously unconditional (`run: make install-shared
to relink`), which was unexecutable in case B.

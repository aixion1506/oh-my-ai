# FX-INS-080 invalid existing JSON

Malformed user `settings.json` is not replaced or edited. The installer reports a
conflict and exits non-zero so the user does not receive a false success.

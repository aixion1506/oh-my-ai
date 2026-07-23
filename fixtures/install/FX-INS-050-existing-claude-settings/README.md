# FX-INS-050 existing Claude settings merge

An existing valid `settings.json` retains user keys and user hooks while the managed
SessionStart, UserPromptSubmit, and `PostToolUse`/`Skill` hooks are merged once.

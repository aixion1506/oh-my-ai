# FX-WSH-090 Synthetic Task Notification

Verifies that the confirmed provider-inserted `<task-notification>` marker is a routing no-op even when its background completion text contains a strong Work-start intent.

The fixture runner first establishes a suggestion from the same real User Prompt, then submits this synthetic event. It expects no new suggestion, no Artifact, and no suggestion-state mutation.

The current adapters pass only the `UserPromptSubmit` payload through to the routing hook and expose no separate verified background-completion or tool-result marker. This fixture is therefore the representative negative case rather than a speculative payload taxonomy.

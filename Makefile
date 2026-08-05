REPO    := $(shell pwd)
PROFILE ?=

.PHONY: install install-shared init-profile install-profile doctor doctor-strict instructions update work-start test-install-fixtures test-routing-fixtures test-work-start-fixtures test-notice-fixtures test-capability-fixtures test-result-fixtures test-truthfulness-fixtures test-jira-ticket-fixtures test-jira-work-fixtures test-git-work-preflight-fixtures test-context-checkpoint-codex-fixtures test-context-checkpoint-fixtures test-pending-handoff-core-fixtures test-pending-handoff-secret-fixtures test-pending-handoff-identity-fixtures test-v1-fixtures test-v1x-fixtures

instructions:
	./scripts/render-instructions.sh

doctor:
	./setup.sh --doctor

doctor-strict:
	./setup.sh --doctor --strict

work-start:
	./scripts/work-start.sh

test-routing-fixtures:
	./scripts/test-routing-fixtures.sh

test-work-start-fixtures:
	./scripts/test-work-start-fixtures.sh

test-notice-fixtures:
	./scripts/test-notice-fixtures.sh

test-capability-fixtures:
	./scripts/test-capability-fixtures.sh

test-result-fixtures:
	./scripts/test-result-fixtures.sh

test-truthfulness-fixtures:
	./scripts/test-truthfulness-fixtures.sh

test-jira-ticket-fixtures:
	./scripts/test-jira-ticket-fixtures.sh

test-jira-work-fixtures:
	./scripts/test-jira-work-fixtures.sh

test-git-work-preflight-fixtures:
	./scripts/test-git-work-preflight-fixtures.sh

test-install-fixtures:
	./scripts/test-install-fixtures.sh

test-context-checkpoint-codex-fixtures:
	node ./scripts/test-context-checkpoint-codex-fixtures.mjs

test-context-checkpoint-fixtures:
	node ./scripts/test-context-checkpoint-fixtures.mjs
	node ./scripts/test-context-checkpoint-codex-fixtures.mjs

test-pending-handoff-core-fixtures:
	node ./scripts/test-pending-handoff-core-fixtures.mjs

test-pending-handoff-secret-fixtures:
	node ./scripts/test-pending-handoff-secret-fixtures.mjs

test-pending-handoff-identity-fixtures:
	node ./scripts/test-pending-handoff-identity-fixtures.mjs

test-v1-fixtures: test-install-fixtures test-routing-fixtures test-work-start-fixtures test-notice-fixtures test-capability-fixtures test-result-fixtures test-truthfulness-fixtures

test-v1x-fixtures: test-v1-fixtures test-context-checkpoint-fixtures test-pending-handoff-core-fixtures test-pending-handoff-secret-fixtures test-pending-handoff-identity-fixtures

install: install-shared

install-shared: instructions
	./setup.sh --install-shared

init-profile:
	@if [ -z "$(PROFILE)" ]; then echo "usage: make init-profile PROFILE=<name>" >&2; exit 2; fi
	./setup.sh --init-profile --profile "$(PROFILE)"

install-profile:
	@if [ -z "$(PROFILE)" ]; then echo "usage: make install-profile PROFILE=<name>" >&2; exit 2; fi
	./setup.sh --install-profile --profile "$(PROFILE)"

update:
	git pull
	$(MAKE) install-shared

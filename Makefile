REPO    := $(shell pwd)
PROFILE ?=

.PHONY: install install-shared install-completion-notify completion-notify-status test-completion-notify doctor-completion-notify uninstall-completion-notify init-profile install-profile doctor doctor-strict instructions update work-start test-install-fixtures test-completion-notify-fixtures test-routing-fixtures test-work-start-fixtures test-notice-fixtures test-capability-fixtures test-result-fixtures test-truthfulness-fixtures test-jira-ticket-fixtures test-jira-work-fixtures test-git-work-preflight-fixtures test-context-checkpoint-codex-fixtures test-context-checkpoint-fixtures test-v1-fixtures test-v1x-fixtures

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

test-v1-fixtures: test-install-fixtures test-routing-fixtures test-work-start-fixtures test-notice-fixtures test-capability-fixtures test-result-fixtures test-truthfulness-fixtures

test-v1x-fixtures: test-v1-fixtures test-context-checkpoint-fixtures

install: install-shared
	@if [ "$(ENABLE_COMPLETION_NOTIFY)" = "1" ]; then ./scripts/completion-notify.py install --yes; else ./scripts/completion-notify.py install; fi

install-shared: instructions
	./setup.sh --install-shared

install-completion-notify:
	@if [ "$(ENABLE_COMPLETION_NOTIFY)" = "1" ]; then ./scripts/completion-notify.py install --yes; else ./scripts/completion-notify.py install; fi

completion-notify-status:
	./scripts/completion-notify.py status

test-completion-notify:
	./scripts/completion-notify.py test

doctor-completion-notify:
	./scripts/completion-notify.py doctor

uninstall-completion-notify:
	./scripts/completion-notify.py uninstall

test-completion-notify-fixtures:
	./scripts/test-completion-notify-fixtures.sh

init-profile:
	@if [ -z "$(PROFILE)" ]; then echo "usage: make init-profile PROFILE=<name>" >&2; exit 2; fi
	./setup.sh --init-profile --profile "$(PROFILE)"

install-profile:
	@if [ -z "$(PROFILE)" ]; then echo "usage: make install-profile PROFILE=<name>" >&2; exit 2; fi
	./setup.sh --install-profile --profile "$(PROFILE)"

update:
	git pull
	$(MAKE) install-shared

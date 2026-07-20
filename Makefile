REPO    := $(shell pwd)
PROFILE ?=

.PHONY: install install-shared init-profile install-profile doctor doctor-strict instructions update work-start test-install-fixtures test-work-start-fixtures

instructions:
	./scripts/render-instructions.sh

doctor:
	./setup.sh --doctor

doctor-strict:
	./setup.sh --doctor --strict

work-start:
	./scripts/work-start.sh

test-work-start-fixtures:
	./scripts/test-work-start-fixtures.sh

test-install-fixtures:
	./scripts/test-install-fixtures.sh

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

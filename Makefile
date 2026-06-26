REPO    := $(shell pwd)
PROFILE ?=

.PHONY: install install-shared init-profile install-profile doctor instructions update

instructions:
	./scripts/render-instructions.sh

doctor:
	./setup.sh --doctor

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

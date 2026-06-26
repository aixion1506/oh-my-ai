REPO    := $(shell pwd)
PROFILE ?=

.PHONY: install install-shared install-profile doctor instructions update

instructions:
	./scripts/render-instructions.sh

doctor:
	./setup.sh --doctor

install: install-shared

install-shared: instructions
	./setup.sh --install-shared

install-profile:
	@if [ -z "$(PROFILE)" ]; then echo "usage: make install-profile PROFILE=<name>" >&2; exit 2; fi
	./setup.sh --install-profile --profile "$(PROFILE)"

update:
	git pull
	$(MAKE) install-shared

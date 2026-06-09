REPO    := $(shell pwd)
CLAUDE  := $(HOME)/.claude

.PHONY: install update

install:
	@echo "=== oh-my-ai: Claude 설정 적용 ==="
	@mkdir -p $(CLAUDE)/skills

	@# 설정 파일 심링크
	ln -sf $(REPO)/claude/CLAUDE.md     $(CLAUDE)/CLAUDE.md
	ln -sf $(REPO)/claude/settings.json $(CLAUDE)/settings.json
	@echo "  linked: CLAUDE.md, settings.json"

	@# 스킬 심링크
	@for skill in $(REPO)/claude/skills/*/; do \
		name=$$(basename $$skill); \
		ln -sf $$skill $(CLAUDE)/skills/$$name; \
		echo "  linked skill: $$name"; \
	done

	@# 플러그인 설치
	@echo "Installing plugins..."
	claude plugin install superpowers
	claude plugin install skill-creator
	claude plugin install context7
	claude plugin install code-review
	claude plugin install serena
	claude plugin install atlassian

	@echo "=== 완료. Claude Code 재시작하면 적용됩니다 ==="

update:
	git pull
	$(MAKE) install

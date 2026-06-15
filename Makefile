REPO    := $(shell pwd)
CLAUDE  := $(HOME)/.claude

.PHONY: install update

install:
	@echo "=== oh-my-ai: Claude 설정 적용 ==="

	@# 설정 파일 심링크
	ln -sf $(REPO)/claude/CLAUDE.md     $(CLAUDE)/CLAUDE.md
	ln -sf $(REPO)/claude/settings.json $(CLAUDE)/settings.json
	@echo "  linked: CLAUDE.md, settings.json"

	@# 디렉토리 통째로 심링크 (새 스킬/커맨드/에이전트 추가 시 자동 추적)
	rm -rf  $(CLAUDE)/skills   && ln -sf $(REPO)/claude/skills    $(CLAUDE)/skills
	rm -rf  $(CLAUDE)/commands && ln -sf $(REPO)/claude/commands  $(CLAUDE)/commands
	rm -rf  $(CLAUDE)/agents   && ln -sf $(REPO)/claude/agents    $(CLAUDE)/agents
	@echo "  linked: skills/, commands/, agents/"

	@# 플러그인 설치
	@echo "Installing plugins..."
	claude plugin install superpowers
	claude plugin install skill-creator
	claude plugin install context7
	claude plugin install code-review
	claude plugin install serena
	claude plugin install atlassian

	@# 외부 마켓플레이스 플러그인
	claude plugin marketplace add wshobson/agents
	claude plugin install backend-api-security@claude-code-workflows
	claude plugin install security-compliance@claude-code-workflows

	@echo "=== 완료. Claude Code 재시작하면 적용됩니다 ==="

update:
	git pull
	$(MAKE) install

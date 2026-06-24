REPO    := $(shell pwd)
CLAUDE  := $(HOME)/.claude
CODEX   := $(HOME)/.codex
AGENT_HOME := $(HOME)/.agents

.PHONY: install update instructions

instructions:
	./scripts/render-instructions.sh

install: instructions
	@echo "=== oh-my-ai: Claude 설정 적용 ==="

	@# 설정 파일 심링크
	mkdir -p $(CLAUDE)
	ln -sf $(REPO)/claude/CLAUDE.md     $(CLAUDE)/CLAUDE.md
	ln -sf $(REPO)/claude/settings.json $(CLAUDE)/settings.json
	@echo "  linked: CLAUDE.md, settings.json"

	@# 디렉토리 통째로 심링크 (새 스킬/커맨드/에이전트 추가 시 자동 추적)
	rm -rf  $(CLAUDE)/skills   && ln -sf $(REPO)/skills           $(CLAUDE)/skills
	@if [ -L "$(CLAUDE)/commands" ] && [ "$$(readlink "$(CLAUDE)/commands")" = "$(REPO)/claude/commands" ]; then rm "$(CLAUDE)/commands"; fi
	rm -rf  $(CLAUDE)/agents   && ln -sf $(REPO)/claude/agents    $(CLAUDE)/agents
	@echo "  linked: skills/, agents/"

	@echo "=== oh-my-ai: Codex 설정 적용 ==="
	@if ! command -v codex >/dev/null 2>&1; then if [ -x "$(REPO)/install.sh" ]; then CODEX_NON_INTERACTIVE=1 sh "$(REPO)/install.sh" || npm install -g --prefix "$HOME/.local" @openai/codex; else npm install -g --prefix "$HOME/.local" @openai/codex; fi; fi
	mkdir -p $(CODEX) $(AGENT_HOME)
	ln -sf $(REPO)/AGENTS.md $(CODEX)/AGENTS.md
	@if [ -d "$(AGENT_HOME)/skills" ] && [ ! -L "$(AGENT_HOME)/skills" ]; then \
		if [ -e "$(AGENT_HOME)/skills.pre-oh-my-ai" ]; then echo "backup exists: $(AGENT_HOME)/skills.pre-oh-my-ai" >&2; exit 1; fi; \
		mv "$(AGENT_HOME)/skills" "$(AGENT_HOME)/skills.pre-oh-my-ai"; \
	fi
	rm -f $(AGENT_HOME)/skills && ln -sf $(REPO)/skills $(AGENT_HOME)/skills
	@echo "  linked: AGENTS.md, skills/"

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

	@echo "=== 완료. AI 도구를 재시작하면 적용됩니다 ==="

update:
	git pull
	$(MAKE) install

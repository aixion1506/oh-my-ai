# 자동화 백로그 (automation-backlog)

`harness-automation` 스킬용 후보 목록. 게이트(3회+ & 안정) 미달인 toil 후보를 여기 누적한다.
같은 패턴 재등장 시 "본 횟수"를 +1 하고, 3회+ & 안정되면 넛지 → 컨펌 시 도구화한다.
형식: `- [최초목격일] 무엇이 toil인가 — 본 횟수 N — 후보 형태/상태`

## 후보
<!-- 예시: - [YYYY-MM-DD] 무엇이 toil인가 — 본 횟수 N — 후보 형태 -->

## 완료 / 폐기
- [2026-06-24] 동일 인프라 오류 재시도·토큰 폭주 → execution-recovery circuit breaker + incident 기록 (DONE)
- [2026-06-22] oh-my-ai 커밋 계정전환 4단계 수동 → `scripts/omai-commit.sh` (DONE)
- [2026-06-19] 릴리즈 노트 작성 → `/release-note` 커맨드 (DONE)

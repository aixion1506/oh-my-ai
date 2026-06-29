# Version Roadmap

## 현재 릴리즈 기준

| 버전 | 이름 | 제품 의미 | 상태 | 목표 |
| --- | --- | --- | --- | --- |
| `v0.1.0-control-plane` | Core seed | 기본 제어판 | tagged | 기본 지침/제어판 |
| `v0.2.0-local-search` | Search workflow | 로컬 검색 workflow | tagged | 로컬 검색 기반 |
| `v0.3.0-shared-template` | Shared template | 개인 하네스에서 공유 템플릿으로 전환 | tagged | 공유 가능한 구조 기준선 |
| `v0.4.0-capture-handoff` | Capture/handoff baseline | 세션 인계 기반 | tagged | handoff skill + capture 설계 기준선 |
| `v0.5.0-profile-onboarding` | Profile onboarding | 개인 profile 설치 UX | tagged | profile 생성/설치 UX |

## v0.5.x hotfix 라인

v0.5.x는 v0.6 milestone을 흔들지 않는 운영 안정화만 담는다. 새 기능이나 workflow는 v0.6 이후 milestone로 보낸다.

| 버전 | 이름 | 제품 의미 | 목표 | 태그 기준 |
| --- | --- | --- | --- | --- |
| `v0.5.1-codex-sandbox-telemetry` | Codex sandbox telemetry fallback | Codex sandbox에서도 usage log 유실과 반복 보고를 줄임 | global state 실패 시 repo-local ignored state fallback, telemetry 실패를 execution-recovery에서 제외 | 이번 hotfix PR 머지 후 필요하면 태그 |
| `v0.5.2` | reserved | 미정 | v0.6 전 긴급 회귀/설치 안정화만 | 필요할 때만 사용 |
| `v0.5.3` | reserved | 미정 | v0.6 전 긴급 회귀/설치 안정화만 | 필요할 때만 사용 |
| `v0.5.4` | reserved | 미정 | v0.6 전 긴급 회귀/설치 안정화만 | 필요할 때만 사용 |

## v0.6 이후 제품 로드맵

| 버전 | 이름 | 제품 의미 | 목표 |
| --- | --- | --- | --- |
| `v0.6.0-search-backend-pilot` | Search backend pilot | context discovery 기반 | `rg`/`find` + Jikji optional backend 정리 |
| `v0.7.0-work-start` | Work start | 첫 killer workflow | 작업 시작 context manifest/prompt 생성 |
| `v0.8.0-work-review` | Work review | 두 번째 killer workflow | AI 작업 결과를 review lens로 검토 |
| `v0.9.0-work-session` | Work session | 통합 루프 | start -> review -> handoff/report 연결 |
| `v1.0.0-local-first-control-plane` | Local-first control plane | 안정판 | tool/agent/context router로 정리 |

## 로드맵 우선순위

| 우선순위 | 기능 | 이유 | 지금 해야 할 일 |
| --- | --- | --- | --- |
| 1 | `v0.6 search-backend-pilot` 마감 | context discovery 기반 필요 | 현재 `feat/search-backend-pilot` 브랜치 마감 |
| 2 | `work-start` | 사용자가 바로 체감하는 첫 killer workflow | 작업 시작 시 필요한 context manifest/prompt 포맷 정의 |
| 3 | `work-review` | AI-generated work 품질관리로 차별화 | diff/review lens와 검증 체크리스트 정의 |
| 4 | `handoff/report` | 멀티 세션/팀 작업 연속성 확보 | start/review 결과를 handoff와 report로 연결 |
| 5 | team profile/policy | B2B 확장 기반 | 개인 profile과 팀 policy 경계 정리 |
| 6 | adapter pack | Jira/Notion/GitHub/MCP 연결 | vendor별 adapter를 core와 분리 |
| 7 | audit/self-hosted | Enterprise 진입 | local-first 감사 로그와 self-hosted 운영 모델 검토 |

## 운영 원칙

- v0.5.x는 hotfix 전용이다. `v0.5.2`~`v0.5.4`를 미리 채우지 않는다.
- v0.6부터는 milestone 단위로 태그한다.
- release branch는 여러 버전을 동시에 유지보수할 때 도입한다. v1.0 전에는 기본적으로 feature/fix branch + tag로 충분하다.
- 회사 Jira 키나 내부 URL은 공개 개인 repo의 커밋/PR/태그에 넣지 않는다.

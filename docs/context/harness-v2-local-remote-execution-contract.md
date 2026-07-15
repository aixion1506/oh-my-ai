# Harness v2 Local/Remote Execution Contract

## 1. 문서 목적

이 문서는 개발 하네스 v2에서 Capability와 Knowledge를 사용자 로컬과 Hosted 환경 중 어디에서 실행할지 정하는 제품·아키텍처 계약이다.

이 문서는 구현 계획이 아니다. 현재 MVP 범위를 확장하지 않으며, Auth/Billing, Hosted API, PostgreSQL schema, Premium Skill, remote execution을 구현하지 않는다.

기존 `docs/context/finance-harness-knowledge-architecture-v2-handoff.md`는 Knowledge Artifact를 어떻게 작성·검증·투영·관리할지 다룬다. 이 문서는 Capability와 Knowledge를 어디에서 실행하고, CLI 배포물과 Hosted 실행 사이의 노출 경계를 어떻게 둘지 다룬다.

## 2. 현재 구현과 v2 제안의 구분

현재 repo 기준 상태:

| 항목 | 상태 | 근거 |
|------|------|------|
| Local-first shared harness | implemented | `README.md`, `setup.sh`, `Makefile`, profile/local 분리 |
| Runtime adapter instruction 생성 | implemented | `AGENTS.md`, `CLAUDE.md`, `claude/CLAUDE.md` generated artifacts |
| `SKILL.md metadata.routing` | implemented | `skills/*/SKILL.md` 일부가 routing metadata 보유 |
| `skills/skill-index.json` 생성 | implemented | `scripts/render-skill-index.mjs` |
| Advisory prompt routing | implemented | `scripts/prompt-routing-hook.mjs` |
| Work-start helper | implemented | `scripts/work-start.sh`, `scripts/work-start-skill-match.mjs` |
| Profile/local 분리 | implemented | `profiles/example/`, `profiles/local/` gitignored |
| Conversation capture contract | documented | `docs/harness-design.md`; capture hook/script는 미구현 |
| Capability Manifest | proposed | v2 후보, schema 미정 |
| Context Transmission Contract 구현 | proposed | v2 후보, 구현 없음 |
| Hosted Control Plane | deferred | 구현 없음 |
| Auth/Billing/Entitlement | absent | 구현·계획 파일 없음 |
| Premium Skill Registry | absent | 구현 없음 |
| Remote Execution | absent | 구현 없음 |
| Hosted Runtime Registry | absent | 구현 없음 |

`AGENTS.md`, `CLAUDE.md`, `claude/CLAUDE.md`, `MINE.md`, `skills/skill-index.json`은 generated artifact다. 직접 수정하지 않고 source instruction 또는 `SKILL.md` metadata를 수정한 뒤 `make instructions`로 재생성한다.

## 3. 제품 원칙

최종 제품 방향:

```text
V1 / MVP
= Local-first Core

V2
= Local-first Core
+ Optional Hosted Premium Capabilities
```

V2는 V1을 클라우드 제품으로 대체하지 않는다. Hosted 기능은 보호가 필요한 Premium Capability를 위한 선택적 추가 레이어다.

확정 원칙:

- 기본 기능은 로그인 없이 로컬에서 동작한다.
- 기존 local skill, routing, work-start, profile 흐름을 유지한다.
- 클라우드 기능은 선택적 추가 기능이다.
- 클라우드 장애가 기본 로컬 기능을 막지 않는다.
- 원격 기능은 명시적 사용자 선택을 요구한다.
- 사용자 장비에 배포된 Artifact는 비밀로 간주하지 않는다.
- Premium 원문 보호가 필요한 Capability는 서버에서 실행한다.
- 전체 제품을 클라우드로 이전하지 않는다.

## 4. Local-first 유지 조건

아래 조건을 만족할 때만 Hosted Premium을 추가해도 Local-first 제품이라고 정의한다.

- 로그인 없이 기본 기능 동작
- 기존 v1 기능을 계정·결제 없이 유지
- 로컬 routing과 local skill 실행 유지
- 클라우드는 optional
- 원격 기능을 사용하지 않아도 CLI 사용 가능
- 클라우드 장애 시 `local-core` 유지
- 원격 전송 전 실행 위치와 전송 범위 표시
- local capability가 얇은 remote wrapper로 축소되지 않음

권장 구조:

```text
Local-first Core + Optional Hosted Premium
```

비권장 구조:

```text
실질적 Cloud-first 제품 + 얇은 CLI Client
```

비권장 구조로 넘어가는 신호는 기본 routing, work-start, profile, local skill 실행이 로그인·결제·Hosted 상태에 종속되는 것이다.

## 5. CLI 배포 Artifact 노출 원칙

사용자 장비에서 실행 가능한 Skill이나 Artifact는 사용자가 최종적으로 열람·추출할 수 있다고 간주한다.

아래 방식은 강한 비공개 경계가 아니다.

- 압축
- 패키징
- 난독화
- 바이너리 내장
- 로컬 암호화 후 실행 시 복호화
- 실행 시 서버에서 다운로드한 뒤 로컬에서 사용

이 방식들은 casual copying이나 단순 복제 난이도를 높일 수 있다. 그러나 CLI가 데이터를 읽고 실행할 수 있어야 한다면, 사용자는 파일, 메모리, 디버거, 로그, cache, network capture, runtime hook을 통해 원문 또는 실질적 내용을 추출할 수 있다고 봐야 한다.

실질적인 Premium Knowledge 보호가 필요하면 원문을 서버에 유지하고, 서버에서 실행한 뒤, 구조화된 결과만 CLI에 반환한다.

## 6. Capability 실행 위치 분류

### `local-core`

정의:

```text
공개 가능한 기본 Harness 기능이며 완전히 로컬에서 실행한다.
```

대상 예시:

- shared instructions
- public/core skills
- local routing
- work-start
- project-context
- local profile
- execution policy

원칙:

- 사용자에게 공개·추출 가능함을 전제로 한다.
- 계정, 결제, entitlement, Hosted 상태에 종속되지 않는다.
- 현재 MVP의 기본 실행 표면이다.

### `local-distributed-extension`

정의:

```text
사용자, 프로젝트 또는 외부 공급자가 로컬에 설치하는 확장이다.
```

대상 예시:

- 사용자 작성 Skill
- 프로젝트 전용 Skill
- 로컬 Private Profile Skill
- 다운로드형 Vendor Pack

원칙:

- 로컬에 배포되는 순간 설치자가 원문을 추출할 수 있다고 간주한다.
- IP 보호 경계로 사용하지 않는다.
- license check, copy friction, source provenance 기록은 가능하지만 비공개 Knowledge 보호를 보장하지 않는다.

### `remote-protected`

정의:

```text
비공개 Knowledge, Prompt, Policy를 서버에만 두고 서버에서 실행한다.
```

대상 예시:

- proprietary workflow
- private prompt
- 고급 policy/routing
- protected knowledge pack
- 내부 red-team/evaluation corpus

원칙:

- 비공개 원문을 CLI에 내려보내지 않는다.
- CLI에는 capability key, input/output contract, context policy, fallback 같은 공개 가능한 정보만 둔다.
- 서버 침해와 운영자 접근은 별도의 보안·운영 통제 문제다.

### `hybrid-context-minimized`

정의:

```text
로컬은 프로젝트 탐색·최소화·redaction을 담당하고,
클라우드는 Premium Knowledge 실행과 결과 검증을 담당한다.
```

로컬 책임:

- file discovery
- 사용자 승인
- secret scan
- context minimization
- exclude rule 적용
- fallback

클라우드 책임:

- entitlement
- premium routing
- private prompt/workflow assembly
- output validation
- usage/audit

원칙:

- 로컬 프로젝트 전체를 자동 업로드하지 않는다.
- 보호해야 하는 Premium Knowledge와 사용자의 민감 프로젝트 context를 분리한다.
- 전송 전 실행 위치와 전송 범위를 사용자에게 표시한다.

## 7. 프로젝트 Context 전송 계약

원격 또는 hybrid Capability는 기본적으로 opt-in이다. 현재 v1/MVP에서는 Hosted 전송 기능을 구현하지 않는다.

필수 원칙:

- 명시적 opt-in
- local / remote / hybrid 실행 위치 표시
- 전송 대상 파일 또는 context 범위 사전 표시
- selected-files-only
- 최소 context 원칙
- 전체 repository 자동 업로드 금지
- secret/token/private key redaction
- `.gitignore` 및 별도 exclude 규칙 존중
- binary/large file 기본 제외
- raw source 저장 여부 명시
- retention 기간 명시
- 학습 사용 여부 명시
- 조직 정책에 따른 remote disable 가능
- local fallback 가능 여부 명시

반드시 로컬에서 먼저 수행할 작업:

- file discovery
- scope selection
- secret scan
- credential redaction
- context minimization
- path normalization

기본 전송 금지 대상:

- 전체 repo
- credentials
- private keys
- `.env`
- ignored local profile
- raw conversation log
- 사용자가 승인하지 않은 파일

현재 repo의 재사용 가능한 선례:

- `scripts/work-start.sh`는 `.git`, `.oh-my-ai`, `profiles/local`, `docs/internal`, `docs/strategy`, `docs/roadmap-private`, env/secret류를 검색 대상에서 제외한다.
- `docs/harness-design.md`는 raw conversation log를 local-only로 두고 curated context만 Git tracking 가능하다고 정의한다.
- `profiles/local/`은 개인·회사별 정책과 token을 shared repo에서 분리한다.

이 선례는 Hosted 전송 구현이 아니라 v2 contract 설계의 기준으로만 사용한다.

## 8. 로그인·결제·Entitlement 경계

이 문서는 구체적인 인증·결제 시스템을 설계하지 않는다. Capability 실행 경계만 정의한다.

로컬 metadata에 둘 수 있는 정보:

- capability key
- display name
- execution type
- input/output contract
- context policy
- required plan UX hint
- fallback
- offline behavior

서버만 최종 판단해야 하는 정보:

- 실제 entitlement
- billing state
- team/org policy
- quota
- active version
- rollout
- disabled state

원칙:

- `required_plan`은 UX 힌트이지 보안 판단 근거가 아니다.
- 최종 entitlement 판단은 서버가 수행한다.
- 서버와 로컬 정보가 불일치하면 서버 판단이 우선한다.
- `local-core`는 entitlement 장애와 무관하게 계속 동작한다.
- `remote-protected`는 entitlement 확인 실패 시 fail-closed 한다.
- 팀·조직 정책은 개인 entitlement보다 우선할 수 있어야 한다.

상태: proposed. 현재 repo에는 Auth/Billing/Entitlement 구현이 없다.

## 9. Metadata와 Routing 책임 경계

현재 실제 routing 흐름:

```text
SKILL.md metadata.routing
→ scripts/render-skill-index.mjs
→ skills/skill-index.json
→ scripts/prompt-routing-hook.mjs
→ advisory skill candidate context

SKILL.md metadata.routing
→ scripts/render-skill-index.mjs
→ skills/skill-index.json
→ scripts/work-start-skill-match.mjs
→ work-start candidate output
```

`scripts/render-skill-index.mjs`가 현재 지원하는 `metadata.routing` subset:

- `visibility`
- `risk_level`
- `task_types`
- `triggers`
- `keywords`
- `use_when`
- `do_not_use_when`
- `requires`

현재 `skills/skill-index.json`은 공개 local skill discovery 전용이다. Premium entitlement와 remote execution을 기존 skill-index에 섞지 않는다.

v2에서는 별도 Capability Manifest가 필요할 가능성이 높다. 이 문서에서는 schema를 설계하지 않는다.

Local Capability Manifest 후보가 공개할 수 있는 정보:

- capability key
- local / remote / hybrid 유형
- context policy
- input/output contract
- fallback
- offline behavior
- required plan UX hint

Hosted Registry가 소유할 정보:

- private implementation
- entitlement
- active artifact version
- rollout
- canary
- audit
- quota
- server-side routing

현재 MVP에서는 기존 `metadata.routing`, skill-index schema, prompt routing, work-start helper를 변경하지 않는다.

## 10. Authoring Source와 Runtime State

### 공개 Local Skill

```text
SKILL.md
= Authoring Source of Truth

SKILL.md
→ validation
→ local skill-index
→ local routing
```

현재 구현은 `scripts/render-skill-index.mjs`의 제한된 metadata validation과 `skills/skill-index.json` 생성까지다.

### 비공개 Premium Skill

```text
Private Server-side Artifact
= Authoring Source of Truth

Private Artifact
→ validation
→ build
→ Hosted Runtime Projection
→ server-side execution
```

상태: proposed/deferred. 현재 repo에는 private server-side artifact나 Hosted Runtime Projection이 없다.

### 운영 상태

Hosted Control Plane이 소유할 수 있는 상태:

- active
- candidate
- canary
- disabled
- entitlement
- rollout
- version
- audit

금지할 구조:

```text
Markdown에서 Skill 의미 수정
+
DB에서 같은 Skill 의미를 사람이 별도로 수정
```

원칙:

- Skill 의미와 본문은 Authoring Artifact가 소유한다.
- Registry는 Projection과 운영 상태만 소유한다.
- Projection은 Authoring Artifact에서 단방향으로 생성한다.
- generated index와 projection row를 사람이 직접 수정하지 않는다.

## 11. Hosted Control Plane의 역할

후보 실행 구조:

```text
CLI
→ Hosted Control Plane
→ Auth / Entitlement
→ Premium Knowledge 조회
→ Prompt / Workflow 조립
→ 외부 LLM API
→ Output Validation
→ CLI 결과 반환
```

Hosted Control Plane 책임:

- authentication
- entitlement
- capability routing
- private knowledge lookup
- prompt/workflow assembly
- context policy
- output validation
- rate limit
- usage/audit

외부 LLM 책임:

- inference
- token processing
- model execution

결론:

- 자체 GPU는 필수 아님.
- 전체 기능을 클라우드화할 필요 없음.
- remote/hybrid capability에만 비용과 지연이 발생하도록 제한한다.
- 모델 API 비용과 Control Plane 운영 비용은 구분해서 측정한다.
- 구체적인 API, 인프라, DB schema는 이 문서에서 설계하지 않는다.

상태: proposed/deferred.

## 12. 장애·Offline·Fallback 계약

기본 동작:

| 상황 | 동작 |
|------|------|
| 네트워크 단절 | `local-core` 계속, `remote-protected` unavailable 표시, fallback이 있으면 local fallback |
| 인증 장애 | `local-core` 계속, remote capability 명시적 실패 |
| entitlement 장애 | remote 실행 fail-closed, 가능한 경우 local fallback |
| Hosted Control Plane 장애 | remote 비활성화, `local-core` 계속 |
| 외부 LLM 장애 | 제한적 retry 또는 명시 실패, 신뢰할 수 없는 partial result 사용 금지 |
| timeout | 취소 또는 사용자 선택 재시도 |
| version mismatch | 서버 manifest 우선, CLI upgrade 안내 또는 compatible fallback |
| quota 초과 | remote 실행 실패, local fallback 가능 시 제공 |

fallback으로 결과를 가장하면 안 되는 경우:

- Premium 원문이 반드시 필요한 기능
- fallback 결과가 동일 품질로 오해될 수 있는 경우
- entitlement가 없는 경우
- 조직 정책이 remote 실행을 금지한 경우

`local-core`는 원격 장애에 종속되지 않는다.

## 13. 기존 Finance Handoff와의 관계

기존 Finance handoff:

```text
Artifact를 어떻게 작성·검증·투영·관리하는가
```

이 문서:

```text
Capability와 Knowledge를 어디에서 실행하는가
```

Finance handoff와 공유하는 원칙:

- Authoring Source와 Runtime Projection 분리
- generated artifact 직접 수정 금지
- runtime state와 artifact meaning 분리
- raw/internal/sanitized output 구분

이 문서가 다루는 별도 주제:

- CLI 배포 artifact는 비밀로 보지 않는 원칙
- Local-first Core와 Hosted Premium의 제품 경계
- remote/hybrid capability의 context 전송 계약
- entitlement와 실행 위치의 책임 분리
- offline/fallback 동작

Finance 전용 Lens, PolicyGuard, intent, fixture 의미는 개발 하네스 Core에 포함하지 않는다.

## 14. 현재 MVP 영향

현재 MVP에서 변경할 것:

- 없음

현재 MVP에서 변경하지 않을 것:

- `metadata.routing`
- skill-index schema
- prompt routing
- work-start
- install flow
- local profile
- execution policy
- Auth/Billing
- DB
- Hosted API

이 문서는 v2 contract를 기록할 뿐, 현재 MVP의 실행 경로를 바꾸지 않는다.

## 15. v2 Backlog

v2 backlog:

- Capability Manifest Contract
- Context Transmission Contract 상세화
- Hosted Registry Contract
- Entitlement Boundary
- Remote Execution Protocol
- Hosted Control Plane Implementation Handoff
- local/remote/hybrid UX 표시 방식
- org-level remote disable policy
- raw source retention/no-training policy
- Premium Artifact provenance와 versioning

모든 항목은 현재 기준 `proposed` 또는 `deferred`다.

## 16. 비목표

- V1을 클라우드 제품으로 전환
- 모든 Skill을 원격화
- 모든 Premium Skill을 로컬 다운로드형으로 제공
- 로컬 배포 Artifact를 완전하게 숨길 수 있다고 주장
- 기존 skill-index에 billing/entitlement를 즉시 추가
- Auth/Billing 구현
- Hosted API 구현
- PostgreSQL schema 설계
- Finance Lens 의미를 Core에 포함
- 현재 MVP 범위 확장
- Capability Manifest schema 상세 설계
- 외부 LLM provider 선택
- 가격 정책 설계

## 17. 구현 시작 조건

아래 조건이 충족되기 전에는 구현을 시작하지 않는다.

- 실제 유료 또는 비공개 Capability 정의
- 보호해야 할 Premium Knowledge 존재
- 프로젝트 Context 전송 정책 확정
- privacy / retention / no-training 정책 확정
- entitlement 모델 확정
- local fallback 기준 확정
- Hosted 실행의 비용·지연 허용 기준 확정

구현을 시작하더라도 첫 단계는 현재 MVP 변경이 아니라 별도 v2 design/implementation handoff여야 한다.

## 18. 최종 결정

개발 하네스 v2의 권장 구조는 다음이다.

```text
Local-first Core
+ Optional Hosted Premium Capabilities
```

Premium Knowledge 보호 원칙:

```text
사용자 장비에 배포된 Artifact는 비밀로 간주하지 않는다.
보호가 필요한 Knowledge는 서버에서 실행한다.
CLI에는 구조화된 결과와 공개 가능한 contract만 반환한다.
```

현재 MVP 결정:

```text
변경 없음.
기존 local skill, routing, work-start, profile, execution policy를 유지한다.
Capability Manifest와 Hosted Control Plane은 v2 backlog로 남긴다.
```

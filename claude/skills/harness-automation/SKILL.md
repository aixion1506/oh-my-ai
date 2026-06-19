---
name: harness-automation
description: Use after deciding to automate a recurring/manual task — to evaluate whether it's ripe, pick the right form (skill vs slash-command vs agent vs script), structure it, and manage its lifecycle. The detection/nudge trigger lives in CLAUDE.md; this skill is the post-confirmation structuring method.
---

# 반복 업무 자동화 — 구조화 양식

## 전제
**감지·넛지 트리거는 CLAUDE.md(상시 로드)에 있다.** 이 스킬은 그 넛지가 **컨펌된 뒤** — "이걸 자동화하자"가 정해진 다음의 평가·형태선택·구조화·정리를 다룬다.

## 착수 게이트 (만들기 전 확인)
1. **3회+ 반복**했는가 (rule of three). 1~2회면 backlog만.
2. **흐름이 안정**됐는가. 아직 바뀌는 중이면 보류 — 만들고 곧 4번 고칠 거면 이르다.
3. **ROI > 유지비**인가.

미달이면 `docs/automation-backlog.md`(또는 메모리)에 후보로 캡처하고 흘려보낸다.

## 형태 선택 — 하나만 추천 (survey 금지)
| 형태 | 언제 |
|------|------|
| 슬래시 커맨드 | 메인 세션에서 내가 실행하는 다단계 워크플로 (조회→가공→출력) |
| 에이전트 | 독립 위임해 결과만 받는 작업, 병렬화 이득 있을 때 |
| 스킬 | 특정 도메인 지식·판단 패턴을 반복 적용 (절차/규율) |
| 셸 스크립트·alias | 판단 불필요한 결정적 명령 시퀀스 |

## 구조화
컨펌된 형태로 만든다. 스킬을 만들/고칠 땐 `writing-skills` 절차를 따른다. oh-my-ai 레포에 작성 후 **개인계정으로 커밋**(devcontainer 워크플로 규칙).

**만든 직후 3종 연결 (이게 "만들기"의 일부 — 잊지 말 것):** CLAUDE.md의 "작업 라우팅 > 확장 규칙"을 따른다 — ① 날카로운 `description` ② CLAUDE.md 라우팅 표에 한 줄 ③ `MINE.md` 등록. 셋 다 해야 다음에 자동으로 붙는다.

## 수명 관리
만든 도구는 **사용 추적**. 장기 미사용이면 정리 — 죽은 스킬/커맨드는 context 비용·혼란이라 음(-)의 가치.

## 자기 개선 (이 시스템 자체도 보완 대상)
방법론이 빗나가면 그 자체를 toil 신호로 보고 고친다. 미스별 수정 위치:
- **오탐**(게이트 통과시켜 만들었는데 곧 prune됨) → 이 스킬의 **착수 게이트**를 조인다.
- **누락**(사용자가 "또/매번/귀찮" 했는데 못 짚음) → **CLAUDE.md의 트리거 신호**에 그 패턴을 추가. (트리거는 여기 아니라 CLAUDE.md다.)
- **형태 오선택** → 이 스킬의 **형태 선택 표**에 분별 기준 보강.

규칙:
- 미스는 즉석 수정 말고 `docs/automation-backlog.md`에 한 줄 회고로 캡처, 체크포인트에서 반영.
- **비대화 금지.** 새 규칙을 넣으면 낡거나 겹치는 줄을 지워 분량을 일정하게 유지한다.

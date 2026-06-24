---
name: worklog-note
description: Use when writing, condensing, or cleaning up 노션 업무일지·Todo 항목 (오늘 한 일 Done, Todo 로드맵, 회의 메모) — especially when entries are verbose, jargon-heavy, auto-generated, or hard to scan at a glance.
metadata:
  source: born-here
  route: 노션 업무일지·Todo 작성·정리 (Done/Todo/회의)
  summary: 장황한 노션 업무일지를 한눈에 들어오도록 정리
---

# 업무일지(Done/Todo) 작성

노션 업무일지를 **한눈에 들어오게** 쓴다. 각 항목은 **굵은 성과/목적 1줄(headline)** 이 먼저 눈에 박히고, 세부는 최소로. 첫 줄만 훑어도 "오늘 뭐 했는지" 잡혀야 한다.

## 출력 모양 (이 형태로 쓴다)

### Done — 오늘 완료
- 항목 = **굵은 headline 1줄.** "무엇을 만들었나"가 아니라 **"어떤 목적/문제를 해결했나"** 를 앞세운다.
- 세부는 **최대 1줄**, 정보가치 있는 것만(하이브리드 매핑, 수치, 핵심 결정). 없으면 생략.
- **구현 디테일(메트릭명·함수명·DDL·옵션값 등)은 Done에서 빼고 backlog로.** 완료 기록엔 불필요 — 스캔만 방해.

**before → after (실제 예):**

before (장황 — 스캔 안 됨):
```
[Dual Write 스택 확정]
- 프로젝트 내 데이터 전수 조사를 통해 팀장님의 TimescaleDB 일괄 도입 초안의
  오버엔지니어링 파악 및 데이터 특성별 '하이브리드 스택' 선회 확정.
- 상태 변경이 잦은 sms_request ➡️ Pure PG 파티셔닝으로 선회 (created_at 기반
  1시간 윈도우 파티션 프루닝 가드 설계).
- 해시 기반 단건 조회가 메인인 sms_scanresult ➡️ Plain PG 일반 테이블로 단순화.
- ... (5줄)
```

after (headline 1줄 + 세부 1줄):
```
- **Dual Write 스택 확정** — TimescaleDB 일괄 도입(오버엔지니어링) 기각 → 데이터 특성별 하이브리드 선회
    - sms_request→PG파티션 / sms_scanresult·stats→Plain PG / audit_log→hypertable
```

### Todo / 로드맵
- 미완 = **굵은 한 줄 + `[ ]`.** 자동 생성된 과세부 항목(메트릭명까지 박힌 것)은 **한 단계 추상화.**
- 며칠짜리 로드맵은 오늘 Done 페이지에 두지 말고 **backlog/다음날로 이월(삭제 X).**

## 묶기 원칙 (일일보고)
- 단순 나열 금지: "A 수정, B 수정, C 수정" ❌ → **목적/성과로 묶기** "반복되던 X를 자동화 (관련 3건)" ✅.
- 어제·오늘 섞지 말 것. 오늘 페이지엔 오늘 한 것만.

## 출력 전 self-check
- 각 항목 **첫 줄만** 훑어서 흐름 잡히나? (안 잡히면 headline 다시)
- 세부가 **2줄 이상**인 항목 있나? → 압축하거나 backlog로.
- **구현 디테일**이 완료 기록에 섞였나? → 빼라.

## 적용 안 함
- 기술 위키/의사결정 페이지(목적·설계고민·개선효과 STAR 템플릿)는 포맷이 다름 — 이 스킬 범위 아님. 거긴 WHY·트레이드오프를 풀어 쓴다.

# Incident: bwrap 편집 실패 재시도 폭주

- 일자: 2026-06-24
- 상태: 개선 완료
- 영향: 하네스 작업 지연과 불필요한 context 소비
- 추정 낭비: raw context 3만~5만 토큰, Plus agentic usage 체감 1~5%

## 발생

apply_patch가 파일을 읽기 전에 종료됐다.

    bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted

같은 실패인데 apply_patch 약 5회, Ruby 경로 4회, Node 대피 3회로 확대됐다.

## 원인

1. 편집 도구의 sandbox network namespace 실패
2. 동일 오류 지문과 재시도 상한 부재
3. 큰 payload와 긴 승인 명령 반복
4. 완료 집착이 복구 비용 제한보다 우선

bwrap 자체는 하네스가 고칠 수 없다. 오류 이후 행동은 통제할 수 있다.

## 개선

- 상시 instruction에 실행 장애 circuit breaker 추가
- execution-recovery 스킬에 재시도 예산과 대피 경로 정의
- 동일 실패 최대 1회, 결정적 인프라 오류는 0회
- 대피와 승인 요청 각각 1회
- Base64 대형 payload와 긴 일회성 prefix rule 금지
- 복구가 비대해지면 중단·보고

## 기대 동작

    apply_patch 실패
    → bwrap 인프라 오류 분류
    → 동일 호출 중단
    → scoped fallback 한 번
    → 검증 또는 blocker 보고

## 검증

- AGENTS와 CLAUDE에 circuit breaker 트리거 존재
- execution-recovery가 MINE에 자동 등록
- skill validator와 make instructions 통과
- 다음 실제 장애에서 동일 도구 2회 초과 호출이 없는지 확인

마지막 항목은 실제 장애 재발 시 판정한다.

# Execution Policy

파일을 직접 수정할지 여부는 사용자별 `execution mode`로 제어한다. shared harness는 특정 사용자의 코드 작성 방식을 강제하지 않는다.

## 기본값

shared 기본값은 `patch-with-approval`이다.

## 모드

### `suggest-only`
- 파일을 직접 수정하지 않는다.
- 변경 전/후, diff, patch, 명령어만 제시한다.
- 사용자가 직접 타이핑하거나 별도로 적용한다.
- 학습 목적이나 강한 통제 선호에 적합하다.

### `patch-with-approval`
- 변경 계획과 diff 또는 적용 범위를 먼저 제시한다.
- 사용자 승인 후 파일을 수정한다.
- shared harness의 기본값이다.

### `auto-apply`
- 명시된 작업 범위 안에서 파일을 직접 수정한다.
- destructive command, secret 노출, generated file 직접 수정, 기존 미커밋 변경 덮어쓰기는 금지한다.
- 수정 후 변경 파일, 검증 결과, 남은 리스크를 보고한다.

## Override

- 환경 변수: `HARNESS_EXECUTION_MODE=suggest-only|patch-with-approval|auto-apply`
- profile 문서: `profiles/local/<profile>/PROFILE.md` 또는 레포 밖 private profile
- 명시적 사용자 지시가 있으면 해당 지시가 우선한다.

## 공통 안전 규칙

모든 모드에서 다음은 금지한다.

- generated file을 source보다 먼저 직접 수정하기
- 기존 미커밋 변경을 확인 없이 덮어쓰기
- secret, token, credential을 커밋 가능한 파일에 쓰기
- destructive command를 승인 없이 실행하기

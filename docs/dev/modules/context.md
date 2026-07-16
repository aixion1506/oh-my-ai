# context module

## 언제 읽나
- `docs/context/*`, `skills/project-context/SKILL.md`, `instructions/harness.md`의 프로젝트 컨텍스트 트리거를 수정하거나, 하네스 설계/결정 문서의 추적 여부를 판단할 때

## 책임
- 하네스 설계와 제품 경계, 장기 결정 contract를 다음 세션이 이어받을 수 있는 형태로 보존한다.
- project-context 흐름이 주입하는 장기 맥락과 public repo에 남길 수 있는 문서의 경계를 구분한다.
- 문서 산출물의 추적 기준은 `instructions/harness.md`의 Document artifact tracking policy를 따른다.

## 이 모듈 고유 제약
- `docs/context/` 전체를 ignore 하지는 않지만, 추적은 파일 단위로 결정한다.
- 커밋 대상은 하네스 설계/결정 contract, 제품 경계, 재사용 가능한 architecture decision이다.
- 제외 대상은 세션 scratch, 회사/domain-specific 원문, 특정 외부 repo나 내부 서비스에 종속된 결정 문서다.
- domain-specific 결정문은 Core Harness에 두지 않고 해당 domain repo 또는 private 보관 위치로 분리한다.
- 미구현 개념을 contract로 기술하지 않는다. 현재 상태와 설계 의도를 구분하고, 의도는 v2 설계 문서에 둔다.
- `instructions/harness.md`에 이미 있는 일반 원칙은 이 문서에 복제하지 않고 참조만 한다.

## 검증
- Canonical target: `git status -sb`
- 추가 확인: `git check-ignore -v <path>`
- 추가 확인: `git diff --check`

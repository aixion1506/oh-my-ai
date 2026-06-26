---
name: local-search
description: "Use when choosing how to find local files, documents, or repository content: prefer rg/find for exact code symbols, strings, regexes, package names, and config keys; consider optional Jikji CLI only as a document context finder in large repos where filename/keyword matching is insufficient."
metadata:
  source: born-here
  summary: rg/find와 Jikji의 역할을 분리하는 로컬 파일·문서 탐색 플레이북
---

# Local Search — rg/find와 Jikji 역할 분리

## 목적

로컬 파일·문서 탐색에서 정확 검색과 자연어 discovery를 분리한다.

- `rg`/`find`가 기본 검색이다. 대부분의 코드·설정 탐색은 여기서 끝난다.
- Jikji는 대형 repo / 문서가 많은 repo에서 파일명·키워드 매칭이 불충분할 때 선택적으로 쓰는 **문서 context finder**다. 코드 심볼 검색 대체재가 아니라 설계 배경·migration decision·plan/spec 문서 등 **관련 문서 후보 랭커**로 사용한다.
- "정답 생성기"가 아니다 — Jikji 결과는 후보 목록이고, 실제 내용은 반드시 원본 파일로 검증한다.
- Jikji는 oh-my-ai에 vendoring하지 않는 외부 CLI이며, 이 스킬은 사용 판단과 안전 경계만 다룬다.

## 선택 기준

| 상황 | 우선 도구 | 이유 |
|------|-----------|------|
| 함수명, 타입명, 패키지명, config key, 정확 문자열, 정규식 | `rg` | 코드/설정의 정확 검색은 빠르고 검증 가능 |
| 파일명 일부, 경로 구조 확인, 좁은 디렉터리 탐색 | `rg --files`, `find` | 인덱스 없이도 충분히 결정적 |
| 설계 배경, migration decision, context 문서, plan/spec, 파일명과 질문 키워드가 안 맞는 경우 | Jikji 검토 | 자연어 단서 기반 문서 discovery에 적합 |
| 회의록, 운영문서, PDF, HWP/HWPX, Office 문서 | Jikji 검토 | 비코드 문서의 자연어 탐색 |

## Jikji 사용 조건

- Jikji가 설치되어 있고 명시적 bounded root가 있을 때만 검토한다.
- **`jikji prepare`는 반드시 human approval 이후에만 실행한다.** agent가 자발적으로 실행하지 않는다.
- `$HOME`, `/`, 대규모 민감 폴더 전체 prepare는 금지하거나 사용자 명시 승인을 받는다.
- **인덱싱 범위**: 먼저 `docs/`, `docs/context/`, plan/spec 문서 디렉터리부터 시작한다. 코드 디렉터리 인덱싱은 기본 보류한다.
- **`--no-agent-rules`를 강하게 권장한다**: agent rule 자동 수정 없이 검색 기능만 사용하는 것이 원칙이다.
- **외부 API/embedding/cloud parser 사용 여부를 설치 전 또는 `jikji prepare` 전에 확인한다.** 사내 repo에서는 민감 데이터가 외부로 전송되지 않는지 먼저 검증한다.
- Jikji는 파일 수정, 삭제, 이동, 정리에 사용하지 않는다.

## 탐색 절차

1. 요청이 정확 코드/설정 검색인지 자연어 파일 discovery인지 먼저 분류한다.
2. 정확 검색이면 `rg`/`rg --files`/`find`로 시작한다.
3. 자연어 discovery이고 bounded root가 있으면 Jikji 사용을 검토한다.
4. Jikji가 confident `answer_paths` 또는 `candidates`를 반환하면 broad crawling을 하지 말고 상위 evidence만 검증한다.
5. Jikji 결과가 empty 또는 clearly wrong이면 query를 더 구체화해서 정확히 1회 재시도한다.
6. 그래도 실패하면 `rg`/`find` fallback으로 전환한다.

## 원본과 인덱스 경계

- Source of truth는 Markdown, docs, 원본 파일이다.
- SQLite/FTS5/Jikji 생성물은 검색용 index/cache/read model이다.
- `.jikji/`, `.jikji_agent_map.md`, `.jikji/doc_text/`는 local generated artifact로 취급한다.
- **공유 repo에서는 `.gitignore`를 수정하지 말고 `.git/info/exclude`에 Jikji artifact를 등록한다.** (`.gitignore`는 tracked 파일이므로 팀 설정에 영향을 준다.)
- Git/rsync 동기화 기준은 원본 문서와 정책 파일이며, 검색 인덱스는 다른 환경에서 필요할 때 재생성한다.

## 금지

- Jikji upstream skill 원문을 그대로 vendoring하지 않는다.
- Jikji 코드를 oh-my-ai core에 복사하지 않는다.
- `jikji prepare`를 human approval 없이 실행하지 않는다.
- `jikji agent-skill-install` 또는 Claude/Codex agent rule 자동 수정 명령을 실행하지 않는다.
- `.jikji/` 생성물을 커밋하거나 공유 대상으로 취급하지 않는다.
- `.gitignore`를 수정하지 않는다 — `.git/info/exclude`를 사용한다.

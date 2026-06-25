---
name: local-search
description: "Use when choosing how to find local files, documents, or repository content: prefer rg/find for exact code symbols, strings, regexes, package names, and config keys; consider optional Jikji CLI only for bounded-root natural-language document/file discovery."
metadata:
  source: born-here
  summary: rg/find와 Jikji의 역할을 분리하는 로컬 파일·문서 탐색 플레이북
---

# Local Search — rg/find와 Jikji 역할 분리

## 목적

로컬 파일·문서 탐색에서 정확 검색과 자연어 discovery를 분리한다. Jikji는 oh-my-ai에 vendoring하지 않는 외부 CLI 기반 optional backend 후보이며, 이 스킬은 사용 판단과 안전 경계만 다룬다.

## 선택 기준

| 상황 | 우선 도구 | 이유 |
|------|-----------|------|
| 함수명, 타입명, 패키지명, config key, 정확 문자열, 정규식 | `rg` | 코드/설정의 정확 검색은 빠르고 검증 가능 |
| 파일명 일부, 경로 구조 확인, 좁은 디렉터리 탐색 | `rg --files`, `find` | 인덱스 없이도 충분히 결정적 |
| 회의록, 설계문서, 운영문서, PDF, HWP/HWPX, Office 문서, 예전 문서 찾기 | Jikji 검토 | 자연어 단서 기반 파일·문서 discovery에 적합 |

## Jikji 사용 조건

- Jikji가 설치되어 있고 명시적 bounded root가 있을 때만 검토한다.
- `jikji prepare`는 bounded root에만 허용한다.
- `$HOME`, `/`, 대규모 민감 폴더 전체 prepare는 금지하거나 사용자 명시 승인을 받는다.
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
- Git/rsync 동기화 기준은 원본 문서와 정책 파일이며, 검색 인덱스는 다른 환경에서 필요할 때 재생성한다.

## 금지

- Jikji upstream skill 원문을 그대로 vendoring하지 않는다.
- Jikji 코드를 oh-my-ai core에 복사하지 않는다.
- Jikji 설치, prepare, refresh, indexing은 별도 승인 없이 실행하지 않는다.
- `.jikji/` 생성물을 커밋하거나 공유 대상으로 취급하지 않는다.

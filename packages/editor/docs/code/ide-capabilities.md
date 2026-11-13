# 코드 편집기 기능 스펙

이 문서는 Editor에서 소스 코드를 편집할 때 보이는 결과를 정의한다. 기능별 내부 구현은 여러 방식이 가능하므로, 언어 서비스 연결처럼 결과가 달라질 수 있는 경계만 계약으로 고정한다. 파일 트리 아이콘 색상은 이 스펙의 범위가 아니다. 여기서 말하는 색상은 편집 중인 **파일 본문 토큰의 문법 및 의미 색상**이다.

## 현재 상태와 제품 목표

현재 코드 편집은 `EditorContent`가 CodeMirror 6 확장을 구성하고, 파일명으로 언어 모드를 찾아 활성화한다. `packages/editor/docs/code/README.md`는 공통 surface·저장·상태 복원 계약을 설명한다. 이 문서는 IDE 편집 기능의 현재 공백과 목표 결과를 추가한다.

| 영역 | 현재 동작 | 목표 결과 |
|---|---|---|
| 본문 문법 색상 | Lezer 문법 파서의 토큰 범주에 `syntaxTheme` 색상을 적용한다. 파일명으로 지원 언어 모드를 선택하며 언어 지원 목록은 provider capability가 제한한다. | 지원 언어 본문에서 키워드, 문자열, 숫자, 주석, 함수, 타입, 속성, 태그가 테마에 맞는 색을 쓴다. 파일 아이콘 색상과 무관하다. |
| 의미 색상 | symbol resolution 기반 semantic token 제공자 없음. | 언어 서버가 제공하는 semantic tokens가 있으면 syntax 색상 위에 적용하고, 없으면 syntax 색상만으로 완결된 표시를 한다. |
| 기본 편집 | history/undo, 기본 CodeMirror 키맵, Tab 들여쓰기, 여러 선택, 검색, 괄호 매칭 및 자동 닫기, 입력 시 indent, 접기 gutter, 선택 단어 일치 강조, 주석 토글이 code 모드에 연결돼 있다. | VS Code 수준의 예측 가능한 키보드 편집, 설정 가능한 들여쓰기, 줄/블록 편집, 다중 커서, 괄호/접기 탐색을 제공한다. |
| 자동완성 | CodeMirror `autocompletion()`과 기본 언어 지원만 연결돼 있다. 프로젝트 인덱스, import, 타입 정보, 문맥 제공자 계약은 없다. | 문맥에 맞는 제안을 제공하고 호출/선택/수락/취소가 일관되며, 제안 출처와 세부 설명을 식별한다. 언어 서버 미연결 시 사용 가능한 로컬 제안만 제공한다. |
| 진단 및 빠른 수정 | 편집기와 언어 서버 사이의 진단/Code Action 연동 없음. | 오류·경고·정보 진단을 문서 위치에 표시하고, 문제 목록/hover/빠른 수정으로 이동한다. 가능한 수정은 미리보기와 적용을 지원한다. |
| 코드 탐색 | line jump 외에 정의/참조/구현/심볼 탐색 provider 없음. | 정의, 타입 정의, 참조, 구현, 문서 심볼, workspace 심볼로 이동하고 원래 위치로 돌아온다. 미지원은 빈 응답과 명시적 비활성 상태로 표현한다. |
| 리팩터링 | rename/refactor/edit provider 없음. | Rename Symbol, Extract/Inline Variable·Method 등 언어가 제공하는 작업을 보여준다. 프로젝트 여러 파일을 바꾸는 작업은 변경 미리보기 후 원자적으로 적용한다. |
| 포맷·import | formatter, format-on-save/type/paste, organize imports 연결 없음. | 문서·선택 범위 포맷과 import 정리를 제공하고 저장 시 포맷을 선택적으로 실행한다. 편집 중인 최신 revision에만 결과를 적용한다. |
| 스니펫 | 별도 snippet 정의/탭 정지점/변수 제공 없음. | 언어 및 사용자 스니펫을 완성 목록에서 선택하고 탭 정지점·선택지·변수 순서대로 이동한다. |

## 목표 사용자 경험

### 문법 색상과 언어 인식

- 파일 확장자 또는 명시적 언어 선택으로 문법 모드를 결정한다. 이름만 보고 판단할 수 없거나 확장자가 없는 파일은 언어를 직접 선택할 수 있다.
- 각 언어 모드는 해당 문법의 키워드, 식별자, 문자열, 숫자, 주석, 연산자, 타입 및 중첩 언어를 분류한다. Markdown fenced code, HTML 안의 CSS/JavaScript 등 내장 언어도 지원 범위에 포함한다.
- 테마는 의미가 일관된 토큰 범주별 색을 정의하며 밝은/어두운 테마에서 대비와 읽기성을 유지한다. `invalid` 토큰은 오류 색으로 구분한다.
- Syntax highlighting은 구문 분석 기반 색상이다. 변수의 실제 선언/타입을 아는 semantic highlighting과 별도이며, 언어 서버가 끊겨도 구문 색상은 계속 표시한다.
- 언어 모드 전환이나 파일 열기에서 이전 비동기 응답이 새 문서에 적용되지 않는다. 언어 모드를 찾을 수 없을 때 평문으로 안전하게 열고 본문 데이터는 변경하지 않는다.

### 입력, 들여쓰기와 구조 편집

- Tab/Shift+Tab은 선택 영역의 indent/outdent, 커서 단독일 때 설정된 공백 또는 탭 정책에 따른 들여쓰기를 수행한다. 기본 indent size와 tab width는 언어별·workspace별 설정으로 재정의할 수 있다.
- Enter는 괄호·블록·리스트 구조에 맞게 다음 줄의 indent를 계산한다. 언어별 입력 규칙을 쓸 수 없는 경우 현재 줄의 선행 들여쓰기를 유지한다.
- 자동 괄호/따옴표 쌍, 괄호 짝 이동/선택, 주석 토글은 언어 문법을 고려한다. 문자열·주석 내부의 자동 입력은 언어별 규칙에 따라 억제한다.
- 여러 커서와 선택은 독립적으로 편집되며, 같은 트랜잭션으로 undo/redo된다. 줄 복제·이동·삭제, 현재 줄 선택, 문서 끝까지 선택, 들여쓰기 가시화와 줄 번호를 지원한다.
- 자동 들여쓰기·괄호 삽입·포맷 결과는 하나의 사용자 작업으로 되돌릴 수 있고 원격 snapshot 반영은 사용자 undo 기록에 들어가지 않는다.
- 접기는 문법이 인식한 블록 및 언어 심볼 경계를 사용한다. 접힌 범위는 화면에서 접힘을 알 수 있고 키보드로 접기/펼치기를 수행할 수 있다.

### 완성, 스니펫 및 진단

- 자동완성은 입력 문맥에 따라 자동으로 열리고, 수동 호출 단축키로 언제든 열 수 있다. 위/아래 이동, 수락, 취소, 설명 확인을 키보드만으로 수행한다.
- 제안에는 label, 종류, 상세 설명, 삽입 범위, 선택적 추가 편집이 포함된다. 응답은 요청 당시 문서 version과 cursor 위치가 아직 유효한 경우에만 적용한다.
- 제안 우선순위는 문맥 적합성, 언어 서버 순위, 최근 사용을 반영한다. 잘못된 자동 제안이 입력을 가로채지 않으며 사용자는 설정에서 자동 표시와 수락 키를 제어할 수 있다.
- 스니펫은 일반 제안과 같은 목록에서 검색할 수 있다. placeholder 간 이동, 동시 편집 가능한 동일 tabstop, 선택지, 변수 확장을 지원한다.
- 진단은 source, severity, range, message 및 선택적 code를 가진다. 문서 revision이 바뀌면 오래된 진단을 새 위치인 것처럼 보이지 않게 무효화하거나 언어 서비스가 갱신한다.
- 진단 hover와 Problems 목록은 같은 진단 집합을 보여준다. 빠른 수정 목록은 현재 선택/커서 범위와 일치하는 조치만 표시한다.

### 탐색, 포맷 및 리팩터링

- 정의·타입 정의·참조·구현은 현재 위치를 기준으로 검색한다. 여러 결과가 있으면 Peek 또는 결과 목록을 표시하며 결과 선택은 대상 파일과 위치를 연다.
- Rename Symbol은 언어 서비스의 심볼 범위에서 모든 변경을 계산한다. 같은 텍스트의 무관한 단어를 단순 치환하지 않는다. 변경 집합은 workspace 경로와 원본 revision을 포함한다.
- Extract/Inline 및 기타 리팩터는 언어가 제공하는 범위에서만 노출한다. 여러 파일을 변경할 때 각 변경을 preview에서 포함/제외할 수 있으며 취소 시 어떤 파일도 수정하지 않는다.
- 포맷 명령은 문서 전체 또는 선택 범위를 지원한다. format-on-save는 설정으로 제어하고, 저장 시점의 revision이 응답 revision과 다르면 자동 결과를 적용하지 않고 최신 내용을 보존한다.
- Organize Imports와 Code Actions On Save는 적용 가능한 provider가 있고 사용자가 켠 경우에만 실행한다. 순서와 충돌 규칙을 UI/설정에 명확히 노출한다.
- 다중 파일 edit는 검증 후 적용한다. 대상 파일이 요청 시점 이후 바뀌었거나 읽기 전용이면 충돌을 표시하고 부분 적용으로 성공한 것처럼 오인시키지 않는다.

## 기능 경계와 서비스 계약

언어 의존 기능은 Editor UI가 특정 언어별 도구를 직접 호출하지 않고 capability provider를 통해 제공한다. Provider는 최소한 다음을 선언한다.

| 계약 | 입력/출력 결과 |
|---|---|
| language identity | 언어 ID, 파일 패턴, 문법 highlight support, embedded language 정보를 제공한다. |
| completion | document URI/version, cursor, trigger를 받아 정렬 가능한 제안을 돌려준다. cancellation을 지원한다. |
| diagnostics | URI/version별 진단 집합을 제공하며 push 또는 pull 방식을 지원한다. |
| navigation | 정의/타입 정의/참조/구현/문서 심볼/workspace 심볼 요청과 위치 결과를 제공한다. |
| code actions | range/context를 입력으로 빠른 수정, refactor, source action을 돌려준다. 적용 edit에는 대상 version이 포함된다. |
| formatting | 문서/범위/입력 포맷 결과를 versioned text edits로 반환한다. |
| rename | 심볼 위치와 새 이름을 받아 workspace edit 또는 명시적 미지원 결과를 반환한다. |
| snippets | 언어/범위에 적용되는 snippet 본문과 tabstop 메타데이터를 제공한다. |

공통 요청은 취소 가능하고, 열린 문서의 URI·revision·언어 ID로 상관관계를 확인한다. provider 오류/timeout은 편집기 입력과 저장을 막지 않으며 해당 기능에 오류를 드러낸다. capability가 없으면 명령을 숨기거나 비활성 처리하고, 실패한 기능을 성공처럼 표시하지 않는다. 응답으로 인한 편집은 문서 session과 저장 흐름을 통과하고 원본 문서 revision 충돌을 검사한다.

## 점진적 제공 순서

1. **편집기 기본기와 색상**: 언어별 문법 강조 목록을 고정하고, 들여쓰기/tab 설정, 괄호·접기·줄 편집·키맵 동작을 일관화한다.
2. **로컬 생산성**: snippet provider, 단어 완성, 문서 내 심볼 및 진단 표시의 결과 상태를 제공한다.
3. **언어 서비스**: capability를 조회하고 취소/버전 검증이 되는 공통 요청 경계를 제공한 뒤 completion, diagnostics, navigation을 연결한다.
4. **안전한 변경 작업**: format, code action, rename, refactor 및 multi-file preview/apply를 revision 검증과 함께 제공한다.

이 순서는 출시 품질 기준을 정의하며 특정 LSP 라이브러리나 서버 구현을 강제하지 않는다. 구현 계획과 우선순위는 [기능 백로그](../../../../docs/planning/backlog.md)에서 관리한다.

## 완료 기준

- 열린 코드의 본문에서 지원 언어 문법 토큰이 테마 색상으로 렌더링되고, 파일 트리 색상과 혼동되지 않는다.
- 지원 언어별 실제 기능을 문법 색상과 semantic/LSP 기능으로 나눈 표가 유지된다. 미지원 기능은 UI가 허위 결과를 내지 않는다.
- 들여쓰기·괄호·완성·진단·탐색·포맷·리팩터의 요청/취소/수락/undo 동작을 키보드와 포인터에서 확인할 수 있다.
- 오래된 언어 응답이나 진단이 다른 파일/새 revision에 적용되지 않는다. 취소된 multi-file preview는 어떤 문서도 변경하지 않는다.
- 동일 편집 기능이 Desktop Editor와 Desktop PKMS에서 공유 Editor surface를 통해 동일한 결과를 낸다.

## VS Code 기준 자료

- [Basic editing](https://code.visualstudio.com/docs/editing/codebasics): 키보드 편집, 포맷, 줄 동작과 편집기 기본 동작
- [IntelliSense](https://code.visualstudio.com/docs/editing/intellisense): 제안, 매개변수 정보, 문서 hover
- [Refactoring](https://code.visualstudio.com/docs/editing/refactoring): Code Actions, Quick Fix, Rename Symbol, 리팩터 미리보기
- [Code Navigation](https://code.visualstudio.com/docs/editing/editingevolved): 정의/참조 이동, Peek, 심볼 탐색
- [User-defined snippets](https://code.visualstudio.com/docs/editing/userdefinedsnippets): snippet, tabstop, placeholder와 변수
- [Extension capabilities](https://code.visualstudio.com/api/extension-capabilities/overview): 문법/semantic highlighting과 언어 기능 확장 경계

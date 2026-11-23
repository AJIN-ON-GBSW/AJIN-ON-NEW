# AJIN ON

제공된 `AJIN_ON_화면설계.html`의 8개 화면을 React 서비스로 옮기고 Spring Boot API와 PostgreSQL 저장소를 연결한 프로젝트입니다.

## 실행

Node.js 24 이상, JDK 25, Docker Compose가 필요합니다. Docker를 실행한 뒤 프로젝트 루트에서 실행합니다.

```sh
npm ci
python3 scripts/dev.py start
```

서비스: [http://127.0.0.1:5175](http://127.0.0.1:5175) · API: [http://127.0.0.1:8080/actuator/health](http://127.0.0.1:8080/actuator/health)

```sh
python3 scripts/dev.py status
python3 scripts/dev.py stop
```

종료해도 PostgreSQL 볼륨의 데이터는 유지됩니다. 스크립트는 이 프로젝트가 시작한 프로세스만 관리합니다. macOS Homebrew의 Node 24/JDK 25를 자동으로 찾으며, 다른 설치 위치는 `NODE_BINARY`, `JAVA_HOME`으로 지정할 수 있습니다. 기본 로컬 환경은 별도 `.env` 없이 실행됩니다. DB 포트·비밀번호 변경은 `.env.example`, API 설정은 [backend/README.md](backend/README.md)를 참고하세요.

실행 중인 API의 소스를 바꾼 경우 `stop` 후 `start`하면 JAR를 다시 빌드합니다. 이미 생성된 PostgreSQL 볼륨의 암호는 `.env` 값만 바꾸어 변경할 수 없습니다.

## 구현 범위

| 화면 | 주소 | 주요 기능 |
| --- | --- | --- |
| 홈 | `/` | 배너, 업무 메뉴, 통합 검색, 자료 접근 |
| 품질5스타 | `/qstar` | 법인별 현황, 실적 연결, 중간 집계 저장, 평가 이력, 엑셀 |
| 실적 관리 | `/performance` | 월별 입고·불량·클레임 입력, PPM, 점수·메모 저장 |
| 품질5스타 현장평가 | `/field-audit` | 운영안·기준표·평가 이력, 결과 등록, 첨부 |
| 내부 현장평가 | `/internal` | 계획·일정 편집, 체크리스트, 분석, 평가 이력 연결 |
| 평가 이력 | `/eval-history` | 원본 이력 4,895행, 필터·분석·더보기, 실제 XLSX 입출력 |
| SQ평가 | `/sq` | 법인·연도별 현황, 결과 등록, 첨부·엑셀 |
| IATF 16949 | `/iatf` | 심사 현황·이력, 결과 등록, 첨부·엑셀 |

입력값과 필터는 PostgreSQL에 자동 저장합니다. 저장 상태를 표시하고, 통신 장애 시 브라우저에 임시 보관하며 재저장과 동시 수정 충돌 처리를 제공합니다. 파일은 실제 원본을 별도 저장하고 검색·다운로드·삭제할 수 있습니다. 엑셀 등록은 11개 열과 행별 값을 검증한 후 일괄 저장하며 중복은 건너뜁니다.

원본에 내용이 없는 `[점수]`·등급 기준·지적사항 본문은 임의로 만들지 않았습니다. 공식 환산표가 없는 월별 수치를 임의 점수로 변환하지 않습니다. 원본의 AI, 원가절감, 교육 등 준비 중 메뉴는 같은 상태입니다. `본사 관리자`는 원본의 편집 모드이며 로그인 인증은 아닙니다. 현재 실행 설정은 로컬 개발용입니다.

## 내부 현장평가 결과보고와 평가 작성

내부 현장평가의 **결과보고**에서 차수와 공장을 선택합니다. 평가이력 분석은 등록된 행을 집계하며, 5개년 지적 추이와 항목 순위는 기획서 25쪽의 집계 기준을 따릅니다. 2026년 1차 점수 보기에는 기획서 23쪽의 보고서 수치를 출처와 함께 표시합니다. 본사 관리자 모드에서 차수별 점수 자료를 입력할 수 있습니다.

홈의 **전체보기 → 평가 작성 도우미**에서 공장·평가일·차수와 관찰을 입력합니다. 내부 평가 기준은 평가일의 연도를 따라 선택합니다. 기본 기준은 28개 항목입니다. 관련 기록의 날짜·공장·관리번호와 원문을 확인하고 판정, 기재 문장, 개선대책을 검토한 후 엑셀로 내려받습니다. **과거 이력에 저장**을 선택한 내부 평가 결과는 평가이력과 결과보고에도 반영됩니다.

두 화면은 서버 PC의 로컬 Ollama를 사용합니다. 기본 모델은 `qwen3:4b`이며 다른 설치 모델은 API를 시작할 때 `AJIN_AI_MODEL`로 지정합니다. 모델이 꺼져 있으면 이력 검색·초안 편집·엑셀 추출과 대시보드 집계를 기본 모드로 사용할 수 있습니다.

## 기술 구성

React 19.3.1 · TypeScript 7.0.2 · Vite 8.3.5 · Spring Boot 4.1.2 · Java 25 · Gradle 9.4.1 · PostgreSQL 18.6. 설치 버전은 lockfile과 Gradle 설정에 고정합니다. 한국어 폰트는 로컬 자산을 사용합니다.

```text
frontend/src/pages/       원본 레이아웃을 보존한 React 화면
frontend/src/components/  자료·등록·검색·엑셀 가져오기
frontend/src/services/    API·저장·집계·XLSX
backend/                  REST API·Flyway·PostgreSQL·파일 저장
scripts/                  실행 관리·원본 React 변환기
docs/                     화면별 기능 대조표
```

화면 생성 코드는 일반 React 컴포넌트이며 원본 HTML 런타임이나 iframe을 실행하지 않습니다. 원본을 다시 변환할 때만 `node scripts/convert-reference.mjs /절대경로/AJIN_ON_화면설계.html`을 사용합니다. 기능 대조와 원본 데이터의 한계는 [docs/reference-inventory.md](docs/reference-inventory.md)에 정리했습니다.

## 검증

```sh
npm test
npm run check
npm run build
cd backend
./gradlew test bootJar
node scripts/smoke.mjs
```

백엔드 통합 테스트는 Docker의 별도 PostgreSQL 컨테이너를 사용합니다. 스모크 테스트는 실행 중인 API를 읽고 자신의 임시 파일만 생성·정리합니다. 상세 API와 환경 변수는 [backend/README.md](backend/README.md)에 있습니다.

GitHub Actions도 같은 프런트엔드 검사와 Java 25·PostgreSQL 통합 테스트를 실행하도록 구성했습니다. 로컬 검증 결과는 [docs/verification.md](docs/verification.md)에 정리했습니다.

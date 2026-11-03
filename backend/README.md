# AJIN-ON API

Spring Boot 4.1.2, Java 25, Gradle Wrapper 9.4.1, PostgreSQL 18.

## 실행

프로젝트 루트의 PostgreSQL Compose를 먼저 실행합니다. API는 데이터베이스 스키마를 Flyway로 생성하고 원본 화면의 초기 데이터를 최초 1회 저장합니다. 기존 수정 데이터는 재시작해도 유지됩니다.

```sh
cd backend
export JAVA_HOME=/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home
./gradlew bootRun
```

기본 주소: `http://127.0.0.1:8080`, 상태 확인: `GET /actuator/health`.

| 환경 변수 | 기본값 |
| --- | --- |
| DATABASE_URL | `jdbc:postgresql://127.0.0.1:55434/ajin_on` |
| DATABASE_USERNAME | `ajin_on` |
| DATABASE_PASSWORD | `ajin_on_local` (로컬 개발 전용) |
| HOST / PORT | `127.0.0.1` / `8080` |
| STORAGE_ROOT | `.local/storage` (API 실행 디렉터리 기준) |
| ALLOWED_ORIGINS | `http://127.0.0.1:5175,http://localhost:5175` |

원본 화면의 관리자 전환은 화면 편집 모드입니다. 사용자 인증/권한 관리 화면이 없는 원본의 범위를 구현했으며 API에 별도 로그인은 없습니다. 외부 배포 시 접근 제어를 설정해야 합니다. 실제 AI 연동은 원본처럼 준비 중입니다.

## API

페이지 키: `main`, `qstar`, `field-audit`, `internal`, `sq`, `iatf`, `performance`, `eval-history`.

| 메서드 / 경로 | 동작 |
| --- | --- |
| `GET /api/pages` | 화면 키와 제목 |
| `GET /api/pages/{page}/state` | `{page,state,revision,updatedAt}` |
| `PUT /api/pages/{page}/state` | `{state:{...},revision:현재버전}` 저장 |
| `GET /api/pages/{page}/history` | 최근 50개 저장 이력 |
| `GET /api/pages/{page}/reference` | 원본 화면 기준표·평가 이력 등 불변 참조 데이터 |
| `GET /api/reference` | 전체 화면 참조 데이터 |
| `GET /api/search?q=검색어` | 저장 데이터와 원본 참조 데이터, 업로드 자료 통합 검색 |
| `POST /api/evaluations/import` | 평가이력 엑셀에서 파싱한 `{rows:[...]}` 일괄 등록 |
| `GET /api/documents?scope=internal` | 위치별 자료 목록 |
| `GET /api/documents/search?q=검색어&scope=internal` | 자료명/분류 검색 |
| `POST /api/documents` | multipart `file`, `scope`, 선택 `title`, `category` |
| `GET /api/documents/{id}/download` | 원본 파일 다운로드 |
| `DELETE /api/documents/{id}` | 메타데이터와 파일 삭제 |

문서 응답은 `{id,scope,title,filename,contentType,size,createdAt,category}`입니다. 문서 목록은 배열입니다. 문서 파일 최대 크기는 25MB, 화면 상태 최대 크기는 1MB입니다. 저장 버전이 다르면 HTTP 409와 `currentRevision`을 돌려줍니다. 파일은 임의 UUID 경로에 저장하므로 업로드 이름으로 경로를 조작할 수 없습니다. 다운로드는 attachment 및 nosniff를 사용합니다. 문서 삭제는 DB 커밋 후 파일을 제거하며, 파일 제거가 실패하거나 프로세스가 중지되면 DB에 남은 작업을 재시도합니다. 업로드 DB 작업이 롤백되면 생성한 파일도 정리합니다.

## 검증

```sh
./gradlew test bootJar
```

Docker가 실행 중이어야 합니다. Testcontainers가 별도 PostgreSQL 18.6 컨테이너와 임시 파일 디렉터리를 생성하고 종료 후 정리합니다. 개발 DB에는 테스트 데이터를 쓰지 않습니다. 검증 범위: 8개 화면 초기 데이터, 실 DB 저장/이력, 동시 수정 충돌, 검색, 실제 파일 업로드·다운로드·삭제, 잘못된 요청, 외부 Origin 차단.

현재 실행 중인 API를 확인하는 스모크 테스트도 제공합니다. 화면 데이터는 읽기만 수행하며, 고유한 이름의 테스트 파일 하나만 생성하고 마지막에 삭제합니다.

```sh
node scripts/smoke.mjs
# 다른 주소: AJIN_API_BASE_URL=http://127.0.0.1:8080 node scripts/smoke.mjs
```

## 평가 이력 일괄 등록

`POST /api/evaluations/import`는 `{rows:[{type,year,date,round,plant,managementNumber,item,judgment,nonconformance,improvement,actionStatus}]}`를 받습니다. `year`는 2000~2100 정수, `round`는 1~10 정수, `date`는 실제 존재하는 `YYYY-MM-DD` 날짜입니다. 평가 종류는 `내부 현장평가`, `품질5스타`, `SQ평가`, `IATF 16949`, 판정은 원본의 `보완`, `일부미흡`, `다수미흡`, `양호`, `미기재`, `Major`, `Minor`, `OFI`를 허용합니다.

한 번에 1~1000행/1MB 이하를 검증하고 모든 행이 올바를 때만 원자적으로 저장합니다. `(type,year,plant,managementNumber,date)`가 같은 행은 기존 등록 데이터와 입력 배치 안에서 중복으로 건너뜁니다. 기존 행과 화면 필터는 보존합니다. 성공 응답은 `{imported,skipped,snapshot}`, 오류는 HTTP 400 `{status,code:"INVALID_IMPORT",message,errors:[{row,field,message}]}`이며 `row`는 첫 데이터 행을 2로 계산한 엑셀 행 번호입니다. 추가 데이터도 화면 저장 이력에 포함됩니다.

# EC2 배포

GitHub Actions의 `Deploy EC2` 워크플로가 React 번들과 Spring Boot JAR를 빌드한 뒤 SSH로 EC2(Amazon Linux 2023)에 올리고 Docker Compose로 실행합니다. 서버에서는 빌드하지 않으므로 t3.small(2 GiB)에서도 동작합니다.

```text
브라우저 ──:3000──▶ nginx (정적 파일, /api 프록시) ──▶ api (Java 25 JRE + app.jar) ──▶ postgres 18
```

PostgreSQL과 API 포트는 외부에 열지 않습니다. 공개 포트는 nginx 한 개(기본 3000)입니다.

## 1. GitHub Secrets 등록

저장소 **Settings → Secrets and variables → Actions → New repository secret**:

| 이름 | 값 | 필수 |
| --- | --- | --- |
| `EC2_HOST` | EC2 퍼블릭 IP | 예 |
| `EC2_USER` | `ec2-user` | 예 |
| `EC2_PASSWORD` | SSH 비밀번호 | 예 |
| `EC2_WEB_PORT` | 공개 포트 (기본 `3000`, 보안 그룹에 열려 있어야 함) | 아니오 |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | nginx HTTP Basic 인증 계정 | 아니오(권장) |

API에는 로그인이 없으므로 공개 IP에 배포할 때는 Basic 인증을 설정하는 것을 권장합니다. 두 값을 지우고 재배포하면 인증이 해제됩니다.

## 2. 배포 실행

`claude/ec2-deployment-setup-uyrt3z` 브랜치에 push하면 자동 실행됩니다. 실패한 실행은 Actions 화면의 **Re-run jobs**로 다시 실행할 수 있습니다(현재 Secrets 값을 사용). 워크플로가 기본 브랜치에 병합된 뒤에는 **Run workflow**로 수동 실행할 수 있습니다.

워크플로는 다음을 수행합니다.

1. `npm ci`, `npm test`, `npm run build`, `./gradlew bootJar`
2. `app.jar`, `web/`, `compose.yaml`, `nginx.conf`를 묶어 `scp` 전송
3. 서버에서 `deploy/remote-deploy.sh` 실행
   - Docker와 Compose 플러그인 설치(최초 1회), 2 GiB 스왑 파일 생성
   - `/opt/ajin-on/releases/<시각>-<커밋>`에 압축 해제, `/opt/ajin-on/current` 링크 갱신
   - DB 비밀번호를 서버의 `/opt/ajin-on/shared/.env`(권한 600)에 최초 1회 생성
   - 컨테이너 재생성 후 `/actuator/health`가 `UP`이 될 때까지 대기, 최근 3개 릴리스만 보관
4. GitHub 러너에서 `http://<EC2_HOST>:<포트>/actuator/health` 확인

## 3. 데이터 보존

- DB: Docker 볼륨 `ajin-on_ajin-on-postgres-data`
- 업로드 파일: `/opt/ajin-on/shared/storage`

재배포해도 둘 다 유지됩니다. 서버에서 상태를 확인하려면:

```sh
cd /opt/ajin-on/current
sudo docker compose --env-file ../../shared/.env ps
sudo docker compose --env-file ../../shared/.env logs -f api
```

## 제한 사항

- 평가 작성 도우미의 로컬 Ollama 모델은 t3.small 메모리로 실행할 수 없어 서버에 설치하지 않습니다. 해당 화면은 README에 적힌 기본 모드(이력 검색·초안 편집·엑셀 추출)로 동작합니다.
- 도메인과 TLS 인증서가 없어 HTTP로 제공합니다. HTTPS가 필요하면 도메인을 연결하고 443 포트에 인증서를 설정해야 합니다.
- 비밀번호 SSH 로그인은 무차별 대입 공격에 취약합니다. 가능하면 SSH 키 인증으로 바꾸고 보안 그룹의 22번 포트를 필요한 IP로 제한하세요.

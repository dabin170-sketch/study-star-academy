# GitHub + Render 배포 안내

이 문서는 코딩이 익숙하지 않아도 따라 할 수 있도록 순서대로 적었습니다.

## 0. 준비물

- GitHub 계정, Render 계정(GitHub로 가입하면 편합니다)
- 컴퓨터에 Node.js 22(로컬에서 먼저 확인하고 싶을 때)
- **결제 정보는 필요 없습니다.** 정적 사이트와 Free 플랜 Web Service만 씁니다.

## 1. GitHub에 올리기

1. GitHub에서 **New repository** → 이름 예: `study-star-academy` → 공개/비공개 아무거나 → Create.
2. 이 폴더에서 아래를 실행합니다(GitHub 웹 화면의 ‘uploading an existing file’로 올려도 됩니다. 이때 `node_modules`, `dist` 폴더는 올리지 마세요).

```bash
git init
git add .
git commit -m "공부별 아카데미 2.0"
git branch -M main
git remote add origin https://github.com/<내아이디>/study-star-academy.git
git push -u origin main
```

3. 저장소의 **Actions** 탭에서 `CI`가 초록색(통과)이 되는지 확인합니다. 처음에는 E2E 때문에 10분 정도 걸립니다.

> 비밀키가 없는 프로젝트라 공개 저장소에 올려도 노출될 키가 없습니다. `.env` 파일은 `.gitignore`로 올라가지 않습니다.

## 2. Render Blueprint로 두 서비스 만들기

1. Render 대시보드 → **New** → **Blueprint**.
2. GitHub 저장소를 연결하고 `study-star-academy` 선택 → Render가 `render.yaml`을 읽어 다음 두 개를 보여 줍니다.
   - `study-star-web` (Static Site) — 앱 화면
   - `study-star-server` (Web Service, Free) — 친구 광장용 실시간 서버
3. 값을 물어보는 환경변수는 일단 비워 두고 **Apply**를 누릅니다.
4. 배포가 끝나면 각 서비스 화면 위쪽에 주소가 나옵니다. 예:
   - 웹: `https://study-star-web.onrender.com`
   - 서버: `https://study-star-server.onrender.com`

## 3. 두 서비스 연결하기(환경변수)

| 서비스 | 키 | 값 |
|---|---|---|
| study-star-server | `ALLOWED_ORIGINS` | 웹 주소 (예: `https://study-star-web.onrender.com`) |
| study-star-web | `VITE_SERVER_URL` | 서버 주소 (예: `https://study-star-server.onrender.com`) |

각 서비스 → **Environment** → 값 입력 → **Save Changes** → 웹은 **Manual Deploy → Clear build cache & deploy**로 다시 빌드합니다(`VITE_`로 시작하는 값은 빌드할 때 화면 코드에 들어가기 때문입니다).

주소 끝에 `/`를 붙이지 않아도 됩니다(붙여도 자동으로 정리합니다).

## 4. 배포 후 확인

1. 서버 주소 + `/health` 를 열면 `{"ok":true,...}` 가 보여야 합니다. 처음엔 1분 정도 걸릴 수 있습니다(잠에서 깨는 중).
2. 웹 주소를 열고 온보딩 → 예시 자료로 체험 → 카드 복습이 되는지 봅니다.
3. 브라우저 창 두 개(하나는 시크릿 창)로 친구 광장에 들어가 방을 만들고 초대 코드로 입장해 봅니다.
4. 새로고침해도 기록이 남는지, 한 번 열어 둔 뒤 와이파이를 끄고도 도서관·온실이 열리는지 확인합니다.

## 5. 자동 배포 흐름

`main`에 푸시 → GitHub Actions(타입 검사·단위/통합 테스트·빌드·E2E) → **통과하면** Render가 자동 배포(`autoDeployTrigger: checksPass`). 테스트가 실패하면 배포되지 않습니다.

Render 대시보드에서 해당 서비스의 Auto-Deploy 설정이 “After CI Checks Pass”로 되어 있는지 확인하세요.

## 6. 서버 없이 쓰고 싶다면

`study-star-server`를 만들지 않거나 지워도 됩니다. `VITE_SERVER_URL`을 비워 두면 친구 광장 화면에만 “서버 주소가 설정되지 않았어요” 안내가 나오고, 나머지 기능은 모두 작동합니다.

## 7. GitHub Pages로 올리고 싶다면(선택)

정적 사이트는 어느 호스팅에나 올릴 수 있습니다. 단, 이 앱은 주소 경로(`/library` 등)를 쓰므로 ‘모든 경로를 index.html로’ 설정이 필요합니다. Render Static Site는 `render.yaml`에 이미 설정되어 있습니다.

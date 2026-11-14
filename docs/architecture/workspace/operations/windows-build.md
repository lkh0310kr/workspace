# Windows 앱 빌드

## 준비

- Node.js 22 이상
- Windows에서 사용할 수 있는 Visual Studio Build Tools와 C++ 빌드 도구
- 저장소 루트에서 `npm install` 완료

## 빌드

`apps/workspace-app` 디렉터리에서 실행합니다.

```powershell
npm run build:win:dir
```

설치 프로그램은 다음 명령으로 만듭니다.

```powershell
npm run build:win
```

배포 버전 설치와 교체는 다음 명령을 사용합니다.

```powershell
npm run promote:stable
```

결과물은 `apps/workspace-app/dist/`에 생성됩니다.

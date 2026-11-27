# RECORD ROOM

LP 레코드 숍처럼 앨범 커버를 둘러보는 인터랙티브 음악 감상 웹사이트입니다.

## 개발 환경 실행

```powershell
npm.cmd install
npm.cmd run dev
```

PowerShell에서 npm 스크립트 실행이 제한된 환경에서는 `npm` 대신 `npm.cmd`를 사용합니다.

## 폴더 구성

- `src/components/`: LP 진열대와 앨범 재킷 컴포넌트
- `src/styles/`: 공통 및 컴포넌트 스타일
- `src/data/playlist.js`: 24곡 플레이리스트와 커버 메타데이터
- `public/covers/`: 제공받은 4개 LP 커버
- `references/`: 개발 참고 자료이며 Git 및 배포 결과물에서 제외

온라인 커버는 Apple iTunes Search API 결과를 사용하며, 4개 커버는 제공받은 파일을 사용합니다. 앨범을 선택해도 이 화면에서 음원을 재생하지는 않습니다.

GitHub Actions에서 빌드하면 Vite의 `BASE_URL`이 `/record-room/`으로 설정되어 GitHub Pages 경로를 반영합니다. 로컬 개발 서버에서는 `/`을 사용합니다.
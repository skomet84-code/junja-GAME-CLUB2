# JUNJA GAME CLUB v2.4.2 RECOVERY HOTFIX

긴급 복구판입니다. v2.4.1의 게임 기능을 추가/변경하는 버전이 아니라, PC와 모바일에서 전체 게임 버튼이 반응하지 않을 수 있는 프론트엔드 초기화 및 PWA 캐시 문제를 방어하도록 수정한 버전입니다.

- 기존 회원/게임머니/아이템/잭팟/Neon DB 유지
- 게임 서버 로직 유지
- UI 이벤트 바인딩 실패 격리
- localStorage 접근 안전 처리
- 구형 Service Worker 및 `junja-club-*` 캐시 자동 정리
- 앱 진입 실패 시 로비 복구 경로 추가

배포: 폴더 안 파일 전체를 기존 GitHub 저장소 루트에 덮어쓴 뒤 Commit → Render Deploy latest commit.

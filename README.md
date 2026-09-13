# JUNJA GAME CLUB v2.4.1 HOTFIX

긴급 수정: 게임방법(Guide) 모달이 PC/모바일에서 닫히지 않아 앱 진입을 막을 수 있는 문제를 방지합니다.

- 첫 로그인 때 가이드 자동 팝업을 제거했습니다. 가이드는 상단 `? 게임방법` 버튼으로 언제든 열 수 있습니다.
- `확인했어`, X, 배경 클릭, ESC 네 가지 닫기 경로를 제공합니다.
- localStorage 사용이 차단되더라도 먼저 모달을 닫도록 순서를 변경했습니다.
- 모달 z-index / pointer-events / touch-action을 보강했습니다.
- JS/CSS/서비스워커 캐시를 v2.4.1로 올리고 앱 셸은 no-cache/no-store로 제공해 구버전 HTML/JS 혼합을 줄였습니다.
- 회원 DB, 게임머니, Neon 저장 구조, 게임 로직은 변경하지 않습니다.

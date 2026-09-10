# JUNJA GAME CLUB v0.5 Test Report

2026-09-10 로컬 Node.js 22 환경에서 검증.

- `server.js` syntax check: PASS
- `public/app.js` syntax check: PASS
- 회원가입 / 사용자 기존 DB 컬럼 마이그레이션: PASS
- 슬롯 API 3×3 grid 반환: PASS
- 슬롯 5 paylines 데이터 구조: PASS
- 777 multiplier source: x1000
- AI Hold'em 시작 / 실제 hole cards / legal action / bot 자동 행동: PASS
- AI Yut 시작 / 던지기 / 말 이동 / bot 자동 턴: PASS
- Seotda 시작 / 패 조회 / 승부 판정 / 정산: PASS
- Go-stop 48-card deal / 공개 데이터에서 deck 숨김 / 카드 플레이 / bot turn / 점수 계산: PASS
- 채팅 관련 server/client route 문자열: 없음
- app.js에서 참조하는 정적 DOM id 존재 여부 검사: PASS
- PWA cache key: `junja-club-v05`

주의: Render Free의 로컬 SQLite 파일은 서버 재생성/재배포 시 영구 보존되지 않을 수 있습니다. 실제 장기 운영 전에는 영구 DB 전환을 권장합니다.

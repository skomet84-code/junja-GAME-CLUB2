# JUNJA GAME CLUB v1.8 TEST REPORT

## 정적 검사
- `node --check server.js` 통과
- `node --check public/app.js` 통과
- `node --check persistent-db.js` 통과
- `node --check public/sw.js` 통과
- PWA cache: `junja-club-v18`
- JS/CSS asset version: `v=180`

## 통합 테스트 · Node 22 로컬 서버
- 회원 A/B 가입 및 세션 로그인 성공
- 친구 게임머니 123G 전송 및 잔액 반영 확인
- LIVE FLOOR 2명 입장 + 고정 말풍선 반응 전송 확인
- 슬롯 3×3 spin API 정상
- AI Texas Hold’em 시작 → 폴드 → 정산 정상
- AI 윷놀이 시작 → 윷 던지기 → pending move 생성 → 종료 정상
- AI 섯다 시작 → 승부 → 결과/초기화 정상
- AI 맞고 시작 → 실제 패 1장 플레이 후 상태 진행 정상
- 경마 경주표 생성 → 단승 레이스 → 7마리 순위 응답 정상
- Big Wheel spin / Sic Bo roll 정상

## Seven Poker
- 50,000G 바이인 시작 성공
- Ante가 street bet과 분리되어 CHECK/CHECK 후 정상적으로 다음 Street 진행하는지 확인
- 3rd → 4th → 5th → 6th → 7th → Showdown 전체 핸드 완료 확인
- 최종 내 족보 / J-BOT 족보 반환 확인
- 다음 핸드 시작 후 FOLD → 핸드 완료 → 테이블 칩 cashout 정상

## Baccarat Duel
- 방 생성 → 두 번째 회원 실시간 입장 성공
- `maxStake = min(두 회원의 현재 잔액)` 확인
- 의도적으로 잔액을 1,000G 단위가 아닌 값으로 만든 후 **정확한 잔액 전체를 MAX stake로 설정 가능** 확인
- MAX + 1G 요청 서버 차단 확인
- 두 회원 READY → Round 1 정상 처리
- Player/Banker 각각 2~3장, point 0~9 확인
- 양쪽 AUTO NEXT 활성화 후 Round 2 정상 처리
- Round 1/2에서 PLAYER/BANKER 역할이 서로 교대되는 것 확인
- `/api/my-room`에서 Baccarat 방 복구 정보 확인
- 양쪽 정상 퇴장 확인

## 회귀 / 모바일
- 일반 게임 슬롯 100,001G 베팅 서버 차단 확인 (기존 100,000G MAX 유지)
- 새 Seven Poker / Baccarat 화면, AUTO 100 버튼, network banner, `viewport-fit=cover` 정적 제공 확인
- 네트워크 online 상태 변경 시 자동 루프 상태를 강제로 초기화하지 않도록 수정
- offline 시 슬롯/Big Wheel/Sic Bo 자동 진행 및 Seven/Baccarat 다음 판 타이머 안전 중지

## 참고
로컬 테스트에서는 `DATABASE_URL`을 넣지 않아 SQLite local mode로 실행했습니다. 배포 환경에서는 기존 Render의 Neon `DATABASE_URL`을 그대로 사용합니다.

# JUNJA GAME CLUB v1.9 TEST REPORT

## 정적 검사
- `node --check server.js` 통과
- `node --check public/app.js` 통과
- `node --check persistent-db.js` 통과
- PWA cache: `junja-club-v19`
- JS/CSS asset version: `v=190`

## 상점 / 인벤토리
- 신규 회원 기준 상점 36개 아이템 조회 확인
- 카테고리 7종 확인: costume / frame / title / pet / table_skin / card_back / bubble_pack
- 100,000G 프레임 구매 후 잔액 정확히 차감 확인
- 구매 아이템 장착 후 `/api/me`에 장착 정보 반영 확인
- 서버 재시작 후 구매 아이템과 장착 상태 유지 확인
- 동일 아이템 중복 구매 서버 차단 확인
- 보유하지 않은 아이템 장착 서버 차단 확인
- 잔액보다 비싼 50,000,000G 아이템 구매 서버 차단 확인
- 구매 기록이 게임머니 장부에 `shop_purchase`로 기록되는 것 확인

## 말풍선 팩
- 기본 말풍선은 미구매 상태에서 사용 가능 확인
- 미보유 로열 팩 말풍선 사용 서버 차단 확인
- 하이프 팩 구매 + 장착 후 `오늘 느낌 온다!` LIVE FLOOR 전송 확인
- LIVE FLOOR 응답에 장착 코스메틱 정보 포함 확인

## 기존 회원 데이터 업그레이드
- 별도 임시 데이터 폴더에서 v1.8 서버로 회원 가입
- 서버 종료 후 동일 데이터 폴더를 v1.9 서버로 실행
- 동일 아이디 / 비밀번호 로그인 성공
- 기존 잔액 1,000,000G 그대로 유지
- 기존 회원에 빈 인벤토리 / 로드아웃 자동 생성 확인
- v1.9 상점 정상 접근 확인

## 회귀 테스트
- 슬롯 spin 정상
- AI Texas Hold'em 시작 / 정산 정상
- AI 윷놀이 시작 / 종료 정상
- AI 섯다 시작 / 액션 정상
- AI 맞고 시작 정상
- Big Wheel spin 정상
- Sic Bo roll 정상
- 경마 경주표 생성 / 레이스 정상
- 랭킹 응답에 코스메틱 데이터 포함 확인

## 수정 중 발견한 회귀 버그
초기 v1.9 작업 중 AI 홀덤의 J-BOT 음수 userId에 코스메틱 로드아웃을 생성하려 해 FK 오류가 발생하는 문제를 테스트에서 발견했습니다. 봇/가상 플레이어에는 빈 코스메틱을 반환하도록 수정 후 AI 홀덤 재테스트를 통과했습니다.

## Neon 영구저장
`persistent-db.js`의 스냅샷 대상에 `user_inventory`, `user_loadout`을 추가했으며 복원 시 두 테이블을 먼저 정리한 뒤 복원하도록 순서를 보강했습니다. 로컬 테스트는 SQLite local mode에서 수행했고, Render에서는 기존 Neon `DATABASE_URL`을 그대로 사용합니다.

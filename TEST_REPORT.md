# JUNJA GAME CLUB v2.0 TEST REPORT

검증일: 2026-09-11

## 자동/로컬 검증
- `node --check server.js` 통과
- `node --check public/app.js` 통과
- 로컬 서버 부팅 및 `/api/me`, `/api/shop` 응답 확인
- 신규 회원 생성 후 상점 67종 로드 확인
- 10억 G PRESTIGE 아이템 5종 가격/희귀도 확인
- `frame_silver` 구매 → 잔액 차감 → 장착 → 프로필 테두리 loadout 반영 확인
- v1.9 DB에서 `frame_bronze`를 보유/장착한 회원을 만든 후 동일 DB를 v2.0으로 부팅해 회원/잔액/인벤토리/장착 상태 유지 확인
- 기존 구매 아이템의 과거 구매가는 장부에 그대로 남고, v2.0의 신규 판매가만 상점에 적용됨
- PWA cache key와 CSS/JS query version을 v2.0으로 갱신

## 회귀 안전성 원칙
- users / ledger / user_inventory / user_loadout 스키마를 초기화하지 않음
- Neon snapshot 대상 테이블 변경 없음
- 기존 게임 확률/배당/멀티룸 로직은 변경하지 않음
- 상점 아이템은 외형 전용이며 게임 승률/배당에 영향 없음

## 운영 전 권장 확인
배포 직후 휴대폰에서 상점 → 프로필 테두리 → 구매/장착 → 로비/게임방 캐릭터 표시를 1회 확인하세요.

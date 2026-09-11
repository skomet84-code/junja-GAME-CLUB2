# JUNJA GAME CLUB v2.1 TEST REPORT

## 정적 검사
- `node --check server.js` 통과
- `node --check public/app.js` 통과
- `node --check persistent-db.js` 통과
- 캐릭터 SVG 30개 생성 및 정적 HTTP 200 응답 확인

## 상점 / 캐릭터 테스트
- 전체 상점 아이템: 97종
- 캐릭터: 30종
- 남성 캐릭터: 15종
- 여성 캐릭터: 15종
- PRESTIGE 캐릭터: 2종
- 캐릭터 asset 경로가 API에 정상 포함되는 것 확인
- 10억 G `JUNJA EMPRESS` 구매 성공 확인
- 구매 후 character 슬롯 장착 성공 확인
- `/api/me` / `/api/shop`에서 장착 캐릭터 정보 반환 확인

## 기존 데이터 마이그레이션
- v2.0 데이터 디렉터리에서 회원 생성
- 같은 DB를 v2.1 서버로 재실행
- 기존 아이디 로그인 성공
- 기존 잔액 유지 확인
- 신규 `character` 장착 슬롯이 NULL 상태로 안전하게 추가되는 것 확인
- 신규 캐릭터 30종이 기존 상점 데이터와 함께 정상 노출되는 것 확인

## 영구저장 호환
- `user_loadout.character` 마이그레이션을 server.js와 persistent-db.js 양쪽에 추가
- 기존 Neon 스냅샷에 character 필드가 없어도 복원 가능하도록 호환 유지

## 주의
실서비스 배포 후에는 모바일 브라우저/PWA가 이전 JS/CSS를 캐시하고 있을 수 있으므로, 최초 1회 완전 종료 후 재접속 또는 PWA 재실행을 권장합니다.

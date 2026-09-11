# JUNJA GAME CLUB v1.6 TEST REPORT

## 정적 검사
- `node --check server.js` 통과
- `node --check public/app.js` 통과
- PWA 캐시 `junja-club-v16` 및 정적 파일 쿼리 `v=160` 갱신

## LIVE FLOOR API 통합 테스트
- 사용자 A/B 신규 가입 성공
- A가 슬롯 LIVE FLOOR 입장 후 참가자 1명 표시 성공
- B가 슬롯 입장 후 A 화면에서 참가자 2명 조회 성공
- B가 `눈 찔러!` 말풍선 전송 후 A 조회 응답에 이모지/문구/만료시간 포함 확인
- B 퇴장 후 A 조회에서 즉시 제거 확인
- slot / holdem / yut / seotda / gostop / horse / bigwheel / sicbo 8개 게임 heartbeat HTTP 200 확인

## 멀티 방 회귀 테스트
- 홀덤 방 생성 성공
- 두 번째 사용자 입장 성공
- 새 말풍선 `맞지 맞지~` 방 반응 API 정상 처리 확인
- 기존 room version / polling / READY 구조 유지

## 데이터 안전
- 회원/게임머니/전적 테이블 구조 변경 없음
- Neon 영구저장 로직 변경 없음
- LIVE FLOOR 접속 상태와 말풍선은 일시 상태이므로 서버 메모리에만 보관하며 회원 DB를 오염시키지 않음
- 자유 텍스트 입력 없음

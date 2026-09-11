# v0.9 TEST REPORT

2026-09-11 로컬 서버 검증 기준.

- Node.js 문법 검사: server.js / public/app.js 통과
- 임의 홀덤 바이인 333,000G 방 생성 성공
- 2인 입장 → 양쪽 READY → 전원 준비 → 게임 시작 성공
- 홀덤 첫 액션 후 상대 turnUserId / turnNickname 변경 확인
- 진행 중 방 호스트 오류 복구 → 양쪽 보유 판돈 환급 및 방 삭제 확인
- 슬롯 임의 베팅 137,000G → 서버 판정 및 3x3 결과 반환 확인
- 경마 임의 베팅 123,000G → 7마리 결과/정산 반환 확인
- 윷놀이 임의 참가금 77,000G 대기실 생성 및 방 비우기 환급 확인
- `/api/my-room` 기존 멀티방 복구 응답 확인
- 관리자 `/api/admin/rooms` 열린 방 조회 확인
- 관리자 WAITING 방 일괄 정리 및 참가금 환급 확인
- API 응답 Cache-Control no-store 적용

주의: 실제 휴대폰 네트워크 상태와 Render Free cold start는 배포 후 별도 현장 테스트 권장.

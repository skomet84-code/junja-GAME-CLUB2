# v1.2 TEST REPORT

실행한 검증:
- `node --check public/app.js` 통과
- `node --check server.js` 통과
- 로컬 Node 서버 부팅 및 정적 페이지 응답 확인
- 일반 회원 2개 생성 / 관리자 로그인 확인
- 관리자 차감 API: 100,000G 정상 차감 확인
- 관리자 잔액 초과 차감: 서버에서 명확한 오류로 차단 확인
- 홀덤방 생성 → 2인 입장 → QUICK REACTION 6종 전송 확인
- 허용되지 않은 reaction key 서버 차단 확인
- reaction 4.5초 만료 후 API 응답에서 제거 확인
- 양쪽 READY → 홀덤 시작 → `myHand.rankLevel` 반환 확인
- PWA cache key `junja-club-v12`, app/style v120 확인

주의: 실제 기기별 GPU 렌더링/애니메이션 체감은 배포 후 Android/iPhone에서 한 번 더 확인하는 것을 권장합니다.

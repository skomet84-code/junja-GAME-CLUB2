# JUNJA GAME CLUB v2.3 TEST REPORT

## 정적 검사
- `node --check server.js` 통과
- `node --check public/app.js` 통과
- `node --check persistent-db.js` 통과
- 서비스워커 캐시 버전 `junja-club-v23` 확인

## 실제 로컬 서버/API 검사
- `/healthz` 정상 응답
- 신규 회원 2명 이상 회원가입/세션 생성 정상
- 상점 API에서 실제 존재하는 상위 아이템 9종의 perk 메타데이터 노출 확인
- 슬롯 희귀심볼 옵션 합산 서버 하드캡 +1% 코드 확인
- 홀덤 AI 입장 시 회원 보유머니 전액이 스택으로 이동되는 것 확인
- 멀티 홀덤: 각 회원 1,000,000G 보유 상태에서 각자 1,000,000G 전액 스택 입장 확인
- 방 강제 종료 시 양쪽 전액 환급 확인
- 멀티 세븐포커도 각 회원 보유머니 전액 스택 입장 확인
- 룰렛 500,000G 단일 베팅 정상 처리 확인 (기존 100,000G 상한 없음)

## 소스/규칙 검사
- 윷 O5/O10에서 routeChoice `shortcut` / `outer` 양쪽 서버 경로 존재 확인
- 멀티/AI 윷 이동 API 모두 routeChoice 전달 확인
- 슬롯 배당: 2 / 3 / 5 / 8 / 10 / 20 / J x800 / 777 x1000 확인
- J Scatter 한 개당 x30 확인
- 룰렛 싱글제로 휠 배열 37포켓, 주요 표준 베팅 배수/판정 로직 확인
- 메인 `/api/me` ONLINE count 반환 및 로비 표시 코드 확인
- 게임별 SOUND scene + 효과음 + MUTE 저장 로직 확인

## 디자인/모바일 검사 범위
- CSS에 윷판 겹침 방지용 보드 타이틀/START/FINISH 축소 및 모바일 브레이크포인트 확인
- 실제 캐릭터 SVG 30종 로컬 미리보기 생성 및 깨짐 여부 육안 확인
- BIG WHEEL / SIC BO / ROULETTE Canvas·CSS 렌더링 코드 정적 확인
- 최종 Render 실서비스의 iPhone/Android 시각/터치 QA는 배포 후 실제 기기에서 한 번 더 확인하는 것을 권장

## 수정 중 발견해 바로 잡은 사항
- 상점 perk 매핑 중 과거 아이템 ID(`frame_legend1b`, `frame_junja_royal`, `pet_junja_guardian`, `title_the_junja`)가 현재 카탈로그 ID와 불일치하는 문제를 수정함.

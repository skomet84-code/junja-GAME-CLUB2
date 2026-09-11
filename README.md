# JUNJA GAME CLUB v1.8 · CASINO PRO

## 핵심 업데이트

### 모바일 안정성 / 편의성
- iPhone/Android safe-area 대응 및 44px 이상 터치 타깃 강화
- 네트워크 끊김/복구 배너 + 재연결 후 회원/방/게임 상태 자동 동기화
- 앱 전환 후 복귀(`visibilitychange`, iOS BFCache `pageshow`) 시 상태 재조회
- GET 요청 재시도, 12초 타임아웃, API 캐시 방지
- 연결이 끊기면 자동 플레이를 안전 중지해 중복 베팅 가능성을 줄임
- Big Wheel / Sic Bo AUTO 10·50·100 추가 (슬롯은 기존 10·50·100 유지)

### JUNJA 세븐포커
- Texas Hold’em과 별개의 **7 Card Stud** AI 게임
- 3rd → 4th → 5th → 6th → 7th Street 진행
- 3rd Street: 2장 비공개 + 1장 공개, 4~6 Street 공개, 7th Street 비공개
- CHECK / CALL / RAISE / FOLD, ½ POT / MAX 버튼
- 내 7장 중 최고의 5장 족보 자동 판정 및 현재 족보/드로우 HUD
- 상대 공개패 분석, 팟/스택/현재 액션/스트리트 진행 표시
- 카드 딜링 애니메이션, 캐릭터 좌석, 모바일 스티키 액션바
- 핸드 종료 후 `AUTO NEXT HAND` 지원
- 일반 게임과 동일하게 바이인 MAX 100,000G

### 바카라 대전 · 1 VS 1 LIVE
- 친구 두 명이 동일 금액을 걸고 직접 맞붙는 PvP 모드
- **고정 베팅 상한 없음**: 그 순간 두 참가자 중 보유머니가 적은 회원의 잔액이 MAX
- MAX 버튼은 1G 단위 잔액까지 정확히 사용 가능
- 승자는 상대 판돈만큼 순이익 / 패자는 같은 금액 차감 / TIE는 잔액 변동 없음
- 8 Deck Shoe, Natural 8/9, 표준 Baccarat Third Card Rule
- PLAYER / BANKER 역할은 매 판 자동 교대
- 참가자 얼굴, 잔액, READY/AUTO 상태, 라운드 결과/포인트/카드 표시
- 두 사람 모두 `AUTO NEXT`를 켜면 결과 확인 후 다음 판 자동 진행
- 방 초대 링크, 실시간 방 복귀, 관리자 강제 종료/대기실 관리 연동

### 기존 기능 유지
슬롯, Texas Hold’em, 윷놀이, 섯다, 맞고, 경마, Big Wheel, Sic Bo, LIVE FLOOR, 고정 말풍선, 친구 게임머니 보내기, 관리자 센터를 유지합니다.

## 데이터 / 배포
- 기존 Neon `DATABASE_URL` 기반 영구저장 구조 유지
- v1.8 신규 통계 컬럼은 시작 시 자동 추가되고 Neon 스냅샷에도 포함됨
- 기존 회원 / 게임머니 / 장부 데이터를 초기화하지 않음
- Render의 `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NICKNAME`은 기존 값 그대로 유지

> 모든 게임머니는 현금 가치가 없고 현금 충전·환전·상품 교환 기능이 없는 순수 가상 재화입니다.

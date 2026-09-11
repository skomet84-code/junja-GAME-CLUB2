# JUNJA GAME CLUB v2.1 — CHARACTER BOUTIQUE

v2.0의 게임/Neon 영구저장/상점 구조를 유지하면서 대표 캐릭터 시스템을 크게 확장한 버전입니다.

## v2.1 핵심
- 프리미엄 대표 캐릭터 30종 추가: 남 15 / 여 15
- 캐릭터를 게임머니로 구매하고 영구 보유/장착
- 캐릭터 가격 500만 G ~ 10억 G
- 남/여 각각 10억 G PRESTIGE 최종 캐릭터 제공
  - JUNJA KING
  - JUNJA EMPRESS
- 상점에 캐릭터 카테고리 + ALL / MAN / WOMAN 필터 추가
- 각 캐릭터 전용 SVG 일러스트 30종 추가
- 장착한 대표 캐릭터가 프로필, 랭킹, LIVE FLOOR, 홀덤, 세븐포커, 바카라, 윷놀이, 섯다, 맞고 등 기존 아바타 표시 위치에 자동 적용
- 기존 테두리/코스튬/펫/칭호와 조합 가능
- 기존 회원/잔액/구매 아이템은 초기화하지 않음
- 기존 user_loadout에 character 슬롯을 안전하게 추가하는 마이그레이션 포함
- PWA 캐시 v2.1 갱신

## 캐릭터 가격대
- RARE: 500만 ~ 2,000만 G
- EPIC: 3,500만 ~ 9,000만 G
- LEGEND: 1.5억 ~ 4.5억 G
- MYTHIC: 6.5억 ~ 8억 G
- PRESTIGE: 10억 G

## 배포
기존처럼 ZIP 압축을 풀고 폴더 안 파일 전체를 GitHub 저장소 루트에 덮어쓴 뒤 Commit → Render Deploy latest commit 하면 됩니다.

Render의 `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NICKNAME`은 그대로 유지하세요.

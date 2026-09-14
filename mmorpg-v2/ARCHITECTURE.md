# V2 Architecture

## 1. Client layers

```text
bootstrap
  ├─ GameLoop
  ├─ InputController
  ├─ World
  │   ├─ CollisionGrid
  │   ├─ PathFinder
  │   ├─ Entities
  │   └─ Interactables
  ├─ Systems
  │   ├─ Movement
  │   ├─ Combat
  │   ├─ Quest
  │   ├─ Gathering
  │   ├─ Crafting
  │   └─ Equipment
  ├─ Renderer
  │   ├─ TileMapRenderer
  │   ├─ CharacterRenderer
  │   ├─ EquipmentRenderer
  │   └─ EffectsRenderer
  └─ UI
```

각 시스템은 서로 직접 뒤엉키지 않고 World State를 통해 통신한다.

## 2. Character Art Bible

### Base canvas
- 논리 캐릭터 셀: 64 x 80 px
- 기준 발 위치(pivot): x=32, y=72
- 방향: down / left / right / up
- 장비와 본체는 동일한 캔버스 크기와 동일 pivot 사용

### Animation frames
- idle: 방향별 2프레임
- walk: 방향별 6프레임
- attack: 방향별 6프레임
- cast: 방향별 6프레임
- hurt: 방향별 2프레임
- dead: 4프레임

### Paper Doll layer order
상황/방향에 따라 일부 순서가 달라질 수 있으나 기본은 아래와 같다.

```text
shadow
back-weapon / cape
body
legs
armor
hair
helmet
front-arm
shield
weapon
face/details
fx
```

### Equipment rule
- 아이템 하나당 단일 PNG를 얹는 방식 금지
- 장비는 반드시 body와 같은 방향/애니메이션 프레임 수를 가진다.
- 무기/방패는 프레임별 hand anchor를 사용한다.
- 투구는 head anchor를 사용한다.
- 갑옷은 별도 좌표 보정 없이 body canvas에 맞춰 제작한다.

## 3. Map rules
- 기본 타일: 48 x 48 px
- 시각 타일과 collision grid를 1:1로 관리
- 벽/물/절벽/건물은 통과 불가
- 문/다리/길은 명시적 walkable flag
- 맵 경계 이동은 Portal 데이터로 관리
- Quest Auto Move는 collision grid 기반 A* path finding

## 4. Mobile input
- 화면 어디서든 touch/pointer down 가능
- 시작점에서 현재 포인터까지 벡터를 이동 방향으로 사용
- 짧은 드래그 dead-zone을 두어 UI 오입력 방지
- 포인터를 놓으면 이동 정지
- NPC/몬스터/오브젝트 탭은 이동 제스처와 구분
- PC는 WASD/방향키를 동시에 지원

## 5. Server ownership
서버가 최종 권한을 갖는 데이터:
- 계정/캐릭터
- 레벨/경험치/스탯
- 인벤토리/장비
- 골드
- 퀘스트 진행
- 제작/강화 결과
- 몬스터 드랍
- 플레이어 위치(멀티 전환 후)

클라이언트만 믿고 재화/강화/드랍을 확정하지 않는다.

## 6. Progression skeleton

### Tier 1: Lv 1-15
초보마을 / 숲 / 광산
- 나무검 → 청동검
- 천옷 → 가죽갑옷
- 들쥐, 슬라임, 들개, 고블린, 광산박쥐
- 구리광석/약초/통나무

### Tier 2: Lv 16-30
산길 / 폐사원
- 철 장비
- 정예몹/첫 파티 보스
- 철광석/고급약초

### Tier 3: Lv 31-50
설원 / 지하궁
- 희귀 장비
- 속성 저항/세트 효과 도입

이후 지역도 같은 패턴으로 확장하되, 레벨만 올린 복붙 콘텐츠는 금지한다.

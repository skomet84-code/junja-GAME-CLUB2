# JUNJA GAME CLUB v0.8

v0.7의 게임 기능을 유지하면서 **계정/게임머니/전적/관리자 기록 영구 저장**을 추가한 버전입니다.

## 핵심 변경
- Neon PostgreSQL을 영구 저장소로 사용
- Render 무료 서버가 잠들거나 재시작돼도 사용자 데이터 복구
- 저장 대상: 회원, 비밀번호 해시, 세션, 게임머니 장부, 전적, 관리자 감사로그
- `DATABASE_URL`이 없으면 로컬 SQLite 모드로 동작
- `DATABASE_URL`이 있으면 로컬 SQLite 상태를 Neon에 지속 동기화하고 서버 시작 시 복원

## Render 설정
자세한 순서는 `PERSISTENCE_SETUP.txt` 참고.

> `DATABASE_URL`은 절대 GitHub에 입력하지 말고 Render Environment에만 저장하세요.

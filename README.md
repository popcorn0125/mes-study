# MES Study — MES 대시보드

실제 제조회사에서 쓸 법한 **MES(생산실행시스템) 대시보드**를 직접 만들면서 MES에 어떤 기능이 있는지, 제조 KPI와 운영 개념이 무엇인지 익히는 학습·포트폴리오 프로젝트입니다.

가상 **BLDC 모터 조립 라인**의 설비 5대(CNC · 권선기 · 조립 셀 · 검사기 · 포장기)가 내는 센서 · 생산 데이터를 서버에 모으고, 대시보드에서 그 데이터를 보는 구조로 만들고 있습니다.

## 주요 기능

### 관리자 모드

MES 기능 단위로 메뉴를 나눴습니다. 브라우저 안의 시뮬레이션 엔진으로 그리던 기존 화면은 삭제했고, 각 페이지는 서버 조회 API를 연결하면서 다시 채웁니다.

| 페이지 | MES 기능 | 상태 |
|---|---|---|
| 생산 현황 | 생산 모니터링 | 빈 페이지 |
| 작업지시 관리 | 작업지시·생산 실행 | 빈 페이지 |
| 설비 관리 | 설비 관리·보전 | 빈 페이지 |
| 품질 관리 | 품질·추적성 | 빈 페이지 |
| 자재/재고 | 자재 관리 | 빈 페이지 |
| 실적 리포트 | 성과 분석 | 빈 페이지 |

단계별 계획서는 [docs/plans/](docs/plans/)에 있습니다. 1~7단계 계획서는 삭제한 엔진 기반 화면의 기록입니다.

### 자동 시뮬레이션

사이드바 아래 **자동 시뮬레이션**(`/simulator`)은 **더미 센서 데이터 발생기(Producer)** 입니다. 열면 1초마다 설비 5대의 난수 데이터를 만들어 서버로 보냅니다. 3D 화면은 그 데이터를 그대로 보여 줍니다. 대시보드로는 브라우저 뒤로 가기로 돌아옵니다.

![자동 시뮬레이션 — 설비별 상태 · 온도 · 진동 라벨과 출하장 · 폐기함 누적 수량](docs/images/3d-scene.png)

- **전송**: 1초(`setInterval` 1000ms)마다 `POST http://localhost:8080/api/v1/sensor-logs/bulk` (axios). 서버가 꺼져 있어도 오류를 무시하고 계속 돕니다.
- **데이터**: 설비별 `equipmentId`, `timestamp`(ISO, 밀리초 포함), `status`, `workOrderId`(고정 `WO-20261024-001`), `metrics`(온도 · 진동), `production`(누적 총수량 · 양품 · 불량)
- **센서 주기(1초)**: 온도 · 진동은 직전 값에서 매초 조금씩(정상 범위 폭의 ±5% 안) 움직이고, 설비별 정상 범위를 벗어나지 않습니다(소수점 첫째 자리).
- **생산 주기(택트 타임)**: 설비마다 택트 타임(CNC 45초 · 권선 40초 · 조립 50초 · 검사 30초 · 포장 25초)이 지날 때마다 `totalCount`가 1 늘고, 95%는 양품 · 5%는 불량으로 셉니다. 그 사이의 전송은 직전 누적 수량을 그대로 보냅니다.
- **상태**: 평소에는 `RUN`입니다. 불량이 나면 `WARN` 또는 `DOWN`(반반)으로 3~5초 바뀌었다가 `RUN`으로 돌아옵니다. `DOWN` 동안은 택트 타이머가 멈춥니다.
- **3D 표시**: 설비 모델 · 작업자 · 경광등(가동 초록 · 경고 노랑 · 고장 빨강) · 바닥 띠가 상태를 따라 움직이고, 라벨에 온도 · 진동을 보여 줍니다. 출하장은 포장기 양품, 폐기함은 전 설비 불량 합계입니다. 버퍼 선반과 자재 랙은 정적으로 표시합니다.

```json
[
  {
    "equipmentId": "CNC_01",
    "timestamp": "2026-10-24T14:53:02.432Z",
    "status": "RUN",
    "workOrderId": "WO-20261024-001",
    "metrics": { "temperature": 49.4, "vibration": 2.8 },
    "production": { "totalCount": 12, "goodCount": 11, "badCount": 1 }
  }
]
```

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 프레임워크 | Vue 3.5, TypeScript 6.0, Vite 8 |
| 라우팅 | vue-router 5 |
| 3D | three.js, TresJS 5 + cientos |
| 통신 | axios (자동 시뮬레이션의 센서 데이터 전송) |
| 테스트·품질 | Vitest 5, ESLint 10 (typescript-eslint, eslint-plugin-vue) |
| 백엔드 | Spring Boot 3.5, Java 17, MyBatis, PostgreSQL 15, Gradle |

- 자동 시뮬레이션이 보내는 데이터는 `backend/`의 Spring Boot 서버(`localhost:8080`)가 받아 PostgreSQL에 저장합니다.
- TypeScript 7.0은 typescript-eslint가 아직 지원하지 않아 6.0을 씁니다.

## 실행 방법

Node 22.12 이상이 필요합니다(`.nvmrc` 참고).

```bash
nvm use
cd frontend
npm install
npm run dev        # 개발 서버
npm test           # 단위 테스트 (Vitest)
npm run lint       # 린트
npm run build      # 타입 검사 + 프로덕션 빌드
```

### 백엔드 (센서 로그 수신 서버)

Java 17과 PostgreSQL이 필요합니다. Gradle은 래퍼(`gradlew`)를 쓰므로 따로 설치하지 않아도 됩니다.

1. DB를 만듭니다. `mes`는 개발용, `mes_test`는 테스트 전용입니다.
   ```bash
   createdb mes
   createdb mes_test
   ```
2. DB 비밀번호를 환경 변수 `DB_PASSWORD`로 넣습니다(예: `~/.zshrc`에 `export DB_PASSWORD=...`). 비밀번호는 파일에 적지 않아 커밋되지 않고, 환경 변수가 없으면 `postgres`를 씁니다. 계정 이름이 `postgres`가 아니면 두 properties 파일의 `username`을 고칩니다.
3. 실행합니다. 서버가 뜰 때 테이블이 없으면 `schema.sql`로 만듭니다.
   ```bash
   cd backend
   ./gradlew bootRun   # http://localhost:8080
   ./gradlew test      # 테스트 (mes_test DB 사용)
   ```

프론트 개발 서버(`npm run dev`, `localhost:5173`)에서 자동 시뮬레이션을 열면 1초마다 데이터가 저장됩니다.

| 테이블 | 저장 방식 |
|---|---|
| `equipment_sensor_log` | 설비별 상태 · 온도 · 진동을 1초마다 INSERT(시계열 로그) |
| `production_performance` | (작업지시, 설비)마다 한 행. 최신 누적 수량으로 UPSERT하고, 지금 값보다 작은 수량(늦게 도착한 요청)으로는 덮어쓰지 않음 |

API: `POST /api/v1/sensor-logs/bulk` — 정상이면 `200 {"sensorLogs":n,"productions":m}`, 필수 값이 없거나 형식이 틀리면 `400 {"message":"..."}`. 자세한 설계는 [docs/plans/backend-sensor-log-api.md](docs/plans/backend-sensor-log-api.md)에 있습니다.

## 아키텍처

```
자동 시뮬레이션: 1초마다 상태 진행 (producer/) ──┬─> POST /api/v1/sensor-logs/bulk (axios) ──> backend/
                                                └─> 3D 화면 (provide/inject)

backend/: Controller ──> Service(@Transactional, metrics · production 분리) ──┬─> SensorLogMapper ──> equipment_sensor_log
                                                                              └─> ProductionPerformanceMapper ──> production_performance
```

- 대시보드 첫 화면에는 three.js가 들어가지 않습니다. 3D 코드는 자동 시뮬레이션 화면이 열릴 때 따로 불러옵니다.

### 폴더 구조

```
frontend/src/
├── router.ts     # 페이지 라우팅 (관리자 모드 페이지 + 전체 화면 자동 시뮬레이션)
├── layout/       # 관리자 모드 레이아웃: 사이드바, 헤더(페이지 제목)
├── views/        # 페이지: 생산 현황, 설비 관리, 작업지시 관리, 품질 관리, 자재/재고, 실적 리포트, 자동 시뮬레이션
├── producer/     # 자동 시뮬레이션: 설비 정의, 더미 센서 데이터 생성, 1초 전송(axios), seed 난수
└── scene/        # 3D 장면(TresJS): 라인 배치, 설비 모델, 사람, 컨베이어, 자재 랙
```

```
backend/src/main/
├── java/com/messtudy/backend/
│   ├── controller/   # SensorLogController: POST /api/v1/sensor-logs/bulk (List<Map>로 받음)
│   ├── service/      # SensorLogService: metrics · production 분리 · 검증 · 트랜잭션
│   ├── mapper/       # MyBatis 매퍼 인터페이스: 센서 로그 다중 INSERT, 생산 실적 UPSERT
│   └── config/       # CORS, 400 오류 응답
└── resources/
    ├── application.properties
    ├── schema.sql    # 테이블 2개
    └── mapper/       # 매퍼 SQL(XML)
```

## 개발 방식

### 브랜치 전략

| 브랜치 | 역할 | 규칙 |
|---|---|---|
| `main` | 배포 브랜치 | 직접 커밋 금지. `dev` 또는 `hotfix/*`에서 PR로만 병합하고, 병합 시 버전 태그(`v0.1.0` 등)를 붙인다 |
| `dev` | 개발 통합 브랜치 | 기능 브랜치의 PR 대상. 항상 빌드·테스트가 통과하는 상태를 유지한다 |
| `feature/<모듈 이름>` | 기능 개발 | `dev`에서 분기 → PR로 `dev`에 병합 → 브랜치 삭제 |
| `hotfix/<작업명>` | 배포본 긴급 수정 | `main`에서 분기 → `main`과 `dev` 양쪽에 병합 |

기능을 만들기 전에 [docs/plans/](docs/plans/)에 계획서(목표, 아키텍처, 완료 기준)를 먼저 쓰고, 구현하면서 바뀐 점도 같은 문서에 기록합니다.

### 커밋 메시지 규칙

[Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 형식을 따릅니다.

```
<type>(<scope>): <요약>
```

- type: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`
- scope: `dashboard`, `simulator`, `scene`, `backend` 등
- 예: `feat(backend): 센서 로그 수신 API 추가`

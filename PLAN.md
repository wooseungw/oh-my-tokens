# oh-my-tokens — 기획서

> OpenCode 플러그인: 프로바이더별 토큰 사용량 추적 및 분석

---

## 1. 개요

### 1.1 프로젝트 목적

OpenCode 사용 시 **어떤 프로바이더에서, 어떤 에이전트가, 어떤 작업(think/chat/code)에 토큰을 얼마나 소비하는지** 실시간으로 추적하고 시각화하는 플러그인.

### 1.2 한 줄 요약

> 사이드바 최상단에 토큰 사용량을 표시하고, 프로바이더별·에이전트별·작업 유형별 분석을 제공하는 제로 의존성 OpenCode 플러그인.

### 1.3 핵심 원칙

| 원칙 | 설명 |
|---|---|
| **제로 토큰 오버헤드** | 플러그인 자체는 LLM을 호출하지 않음. 컨텍스트 윈도우에 주입하지 않음 |
| **제로 의존성** | 외부 npm 패키지 없음. Bun 내장 API(fs, path, crypto, fetch, bun:sqlite)만 사용 |
| **로컬 우선** | 기본은 로컬 파일만 사용. 프로바이더 한도 조회는 opt-in (auth.json 토큰 재사용) |
| **토큰 우선** | 기본 표시 단위는 토큰. 달러 표시는 선택 |
| **비침습적** | Toast와 사이드바만 사용. noReply + ignored로 컨텍스트 오염 제로 |

---

## 2. 기존 플러그인 분석

### 2.1 opencode-quota (github.com/slkiser/opencode-quota)

| 항목 | 내용 |
|---|---|
| 핵심 가치 | 프로바이더별 남은 quota 잔여량 표시 |
| 데이터 소스 | 프로바이더 API (원격) + opencode.db (로컬) |
| 저장소 | 인메모리 캐시 / qwen-local-quota.json |
| SDK Hook | `tool.execute.after`, `event(idle/compacted)`, `command.execute.before` |
| UI | Toast + `/quota`, `/tokens_*` 명령어 |
| 약점 | 누적 추세 분석 없음 |

### 2.2 opencode-token-monitor (github.com/Ainsley0917/opencode-token-monitor)

| 항목 | 내용 |
|---|---|
| 핵심 가치 | 누적 사용량 + 추세 분석 + 예산 관리 |
| 데이터 소스 | 메시지 이벤트 (로컬) |
| 저장소 | 월별 샤딩 JSON (~/.opencode/token-history/) |
| SDK Hook | `message.updated`, `session.idle` |
| UI | Toast + `token_stats`/`token_history`/`token_export` 도구 |
| 약점 | 프로바이더 구분 없음. think/chat/code 분류 없음 |

### 2.3 두 플러그인 병행 사용 시 문제점

- Hook 중복 → Toast 2번 표시
- 프로바이더 감지 로직 이중 작업
- 명령어 체계 분산 (`/quota` vs `token_stats`)
- 데이터 격리 → 프로바이더와 사용량 간 연관 분석 불가

---

## 3. oh-my-tokens 범위 정의

### 3.1 포함 (In Scope)

- 프로바이더별 토큰 사용량 추적 및 비율 표시
- 에이전트별 사용량 추적 (coder, task, title, summarizer)
- 서브에이전트 체인 사용량 집계
- Think / Chat / Code / Input / Cache 토큰 분류
- 세션별 / 일별 / 주별 / 월별 추세 분석
- 예산 한도 알림 (토큰 기준, 선택적 달러)
- 사이드바 최상단 표시 (3단계: compact / normal / extend)
- Toast 알림 (응답 시)
- 슬래시 명령어
- 프로바이더/커넥터 변경 자동 감지
- 내보내기 (JSON / CSV)
- 프로바이더 한도 자동 감지 (opt-in, auth.json 토큰 재사용)
- opencode-quota 플러그인 연동 (opt-in, 미설치 시 자동 폴백)
- 시작 시 누락 이벤트 백필 (opencode.db에서 복구)

### 3.2 제외 (Out of Scope)

- ~~Quota 잔여량 조회~~ → opt-in Enrichment로 부분 포함 (섹션 10 참조)
- 컴패니언 플러그인 의존 (antigravity-auth, qwencode-auth 등)
- 다중 머신 동기화 (로컬 우선, 추후 옵션)

---

## 4. 아키텍처

### 4.1 데이터 흐름

```
[LLM API 응답]
     │  usage: { prompt_tokens, completion_tokens, reasoning_tokens, ... }
     ▼
[OpenCode Core]
     │  메시지에 토큰 정보 포함하여 저장 (opencode.db)
     │  SDK 이벤트로 노출 (message.updated — 여러 번 발생 가능)
     ▼
[oh-my-tokens Plugin]
     │
     ├── Event Pipeline (message.updated, session.idle, session.compacted)
     │        │
     │        ├── Classifier: think/chat/code 분류
     │        ├── Attribution: 에이전트 귀속 (실행/기원)
     │        └── Recorder: SQLite UPSERT (트랜잭션 내 event+rollup 원자적 기록)
     │
     ├── Enrichment (opt-in, enrichment: "auto" | "opencode-quota" 시)
     │        │
     │        ├── auth.json에서 프로바이더 토큰 읽기 (인메모리만, DB 저장 금지)
     │        ├── 프로바이더별 한도 API 조회 (캐시 TTL: 5분)
     │        └── tier 감지 + 잔여량 갱신
     │
     ├── Backfill (시작 시 1회)
     │        └── opencode.db에서 누락된 이벤트 복구 → oh-my-tokens.db에 UPSERT
     │
     ├── Analytics (읽기 전용, 명령어/사이드바 갱신 시)
     │        ├── Aggregator: 인메모리 집계
     │        ├── Trends: 추세/스파이크 계산
     │        └── Budget: 예산 체크
     │
     └── UI
              ├── Sidebar: 5초마다 폴링, 3단계 표시
              ├── Toast: 응답 후 알림
              └── Commands: 슬래시 명령어 출력 (리치 뷰 포함)
```

### 4.2 토큰 측정 방식

플러그인이 직접 토큰을 세지 않는다. OpenCode가 이미 측정한 값을 읽는다.

```
LLM API가 응답 헤더에 토큰 수 포함
    → OpenCode가 메시지 객체에 저장
    → SDK 이벤트(message.updated)로 플러그인에 전달
    → 플러그인은 분류·집계·기록만 수행
```

주의: `message.updated`는 동일 메시지에 대해 **여러 번 발생**할 수 있다 (토큰 정보가 점진적으로 채워짐).
따라서 `INSERT OR IGNORE`가 아닌 **UPSERT**를 사용하여 최신 데이터로 덮어쓴다.

SDK 이벤트에서 제공되는 데이터:

```typescript
interface AssistantMessage {
  tokens: {
    input: number;
    output: number;
    reasoning?: number;       // optional — 모든 모델이 제공하지 않음
    cache: {
      read: number;
      write: number;
    };
  };
  model?: string;             // "claude-sonnet-4" — optional
  provider?: string;          // "anthropic" — optional (커스텀 프로바이더 시 누락 가능)
  mode?: string;              // "coder" | "task" | ...
  parts: MessagePart[];
  toolCalls: ToolCall[];
}
```

### 4.3 모듈 구조

```
oh-my-tokens/
├── src/
│   ├── index.ts                 # Plugin entry point
│   ├── paths.ts                 # 크로스플랫폼 경로 해석 (XDG, Windows, macOS)
│   ├── pipeline.ts              # Event hooks → 모듈 분배
│   │
│   ├── tracking/                # 사용량 추적
│   │   ├── recorder.ts          #   SQLite UPSERT (트랜잭션 내 event+rollup 원자적 기록)
│   │   ├── classifier.ts        #   think/chat/code 분류
│   │   ├── attribution.ts       #   에이전트 실행/기원 귀속
│   │   └── normalizer.ts        #   프로바이더 표시 정규화 (display용)
│   │
│   ├── analytics/               # 분석 (읽기 전용)
│   │   ├── aggregator.ts        #   인메모리 집계
│   │   ├── trends.ts            #   추세 / WoW / 스파이크
│   │   ├── budget.ts            #   예산 한도 체크
│   │   └── pricing.ts           #   models.dev 가격 참조 (unit=cost 시, 별도 pricing 정규화)
│   │
│   ├── storage/                 # 저장소
│   │   ├── db.ts                #   SQLite 연결 + WAL + busy_timeout + 테이블 관리
│   │   ├── migrations.ts        #   스키마 마이그레이션
│   │   ├── rollup.ts            #   집계 캐시 (SQLite 읽기)
│   │   ├── sessions.ts          #   세션 그래프 (SQLite 읽기)
│   │   └── backfill.ts          #   opencode.db에서 누락 이벤트 복구
│   │
│   ├── enrichment/              # 프로바이더 한도 조회 (opt-in)
│   │   ├── resolver.ts          #   enrichment 모드 분기 + 폴백
│   │   ├── providers.ts         #   프로바이더별 API 호출
│   │   └── cache.ts             #   TTL 캐시 (5분)
│   │
│   └── ui/                      # 출력
│       ├── sidebar.ts           #   사이드바 패널 (3단계, 행 기반)
│       ├── toast.ts             #   응답 후 알림
│       ├── commands.ts          #   슬래시 명령어 (리치 뷰 포함)
│       └── formatter.ts         #   표시 단위 변환 (tokens/cost)
│
├── package.json
└── tsconfig.json
```

### 4.4 의존성

```jsonc
// package.json
{
  "name": "oh-my-tokens",
  "version": "0.1.0",
  "dependencies": {}  // 제로 의존성
}
```

사용하는 API:
- Bun 내장: `fs`, `path`, `crypto`, `fetch`, `bun:sqlite`
- OpenCode SDK: `@opencode-ai/plugin` (타입만)

### 4.5 프로바이더 정규화

OpenCode는 11가지 이상의 프로바이더 등록 방식을 지원한다.
SDK 이벤트의 `providerID`가 항상 표준 이름이 아닐 수 있으므로 정규화가 필요하다.

**⚠️ 표시 정규화(display)와 가격 정규화(pricing)는 목적이 다르므로 분리한다.**

| 용도 | 함수 | 예시: `"github-copilot"` | 예시: `"openrouter"` |
|---|---|---|---|
| **표시용** (`normalizeDisplayProvider`) | 사이드바·Toast에서 사용자에게 보여줄 이름 | `"copilot"` (별도 버킷) | `"openrouter"` 또는 모델에서 추론 |
| **가격용** (`normalizePricingProvider`) | models.dev 가격 조회 시 매핑 | `"openai"` (가격은 OpenAI 기준) | 모델에서 추론 (실제 원본 프로바이더) |

#### 표시 정규화 전략

| 등록 방식 | providerID 예시 | 표시 정규화 결과 |
|---|---|---|
| 환경변수 / opencode.json | `"anthropic"` | `"anthropic"` |
| /connect 명령어 | `"openai"` | `"openai"` |
| GitHub Copilot (managed auth) | `"github-copilot"`, `"copilot-chat"` | `"copilot"` |
| 커스텀 프로바이더 | `"my-proxy-1"` | 모델명에서 추론, 실패 시 원본 유지 |
| OpenRouter | `"openrouter"` | 모델명에서 추론, 실패 시 `"openrouter"` |
| AI Gateway (Cloudflare/Vercel) | `"cloudflare-ai-gateway"` | 모델명에서 추론, 실패 시 원본 유지 |
| 로컬 모델 (Ollama) | `"local"` | `"local"` |
| AWS Bedrock | `"bedrock"` | 모델명에서 추론, 실패 시 `"bedrock"` |
| Google VertexAI | `"vertexai"` | `"google"` |
| SAP AI Core | `"sap-ai-core"` | 모델명에서 추론, 실패 시 원본 유지 |

표시 정규화 구현:
1. `providerID` → 소문자 변환 + 알려진 별칭 매핑 (`"github-copilot"` → `"copilot"`)
2. `providerID` 누락/unknown 시 → 모델명에서 프로바이더 추론:
   - `claude*` → `"anthropic"`
   - `gpt*`, `o1*`, `o3*` → `"openai"`
   - `gemini*` → `"google"`
   - `grok*` → `"xai"`
3. 모델명에 프로바이더 접두사 포함 시 파싱: `"anthropic/claude-sonnet-4"` → provider=`"anthropic"`, model=`"claude-sonnet-4"`
4. 추론 불가 시 → `providerID` 원본 유지 (unknown 허용)

---

## 5. 데이터 모델

### 5.1 저장소 구조
```
<DATA_DIR>/oh-my-tokens/
├── oh-my-tokens.db              # SQLite (WAL 모드) — 이벤트 + 집계 + 상태
└── config.json                  # 사용자 설정 (override)
```

**`<DATA_DIR>` 크로스플랫폼 해석** (xdg-basedir 의존 없이 자체 구현):

| 플랫폼 | 기본 경로 | 환경변수 우선 |
|---|---|---|
| **Linux** | `~/.local/share/opencode/` | `$XDG_DATA_HOME/opencode/` |
| **macOS** | `~/.local/share/opencode/` | `$XDG_DATA_HOME/opencode/` |
| **Windows** | `%LOCALAPPDATA%\opencode\` | `%XDG_DATA_HOME%\opencode\` |

폴백 후보 (OpenCode 설치 방식에 따라 데이터 경로가 다를 수 있음):

| 플랫폼 | 후보 경로 |
|---|---|
| **Linux** | `~/.local/share/opencode`, `~/.config/opencode` |
| **macOS** | `~/.local/share/opencode`, `~/Library/Application Support/opencode` |
| **Windows** | `%LOCALAPPDATA%\opencode`, `%APPDATA%\opencode`, `~\.local\share\opencode` |

구현: `src/paths.ts` — `opencode.db` 위치 탐색 시 후보 목록을 순회하며 파일 존재 확인.
이 로직은 opencode-quota의 `opencode-runtime-paths.ts`와 동일하되, `xdg-basedir` 패키지 없이 순수 환경변수 + `os.homedir()` 조합으로 구현.

### 5.2 이벤트 테이블 (SQLite)

```sql
-- events 테이블
CREATE TABLE IF NOT EXISTS events (
  key       TEXT PRIMARY KEY,       -- 멱등 키 (sid:msg_id)
  ts        INTEGER NOT NULL,       -- timestamp (epoch milliseconds)
  ver       INTEGER DEFAULT 1,      -- UPSERT 버전 (갱신 시 증가)
  sid       TEXT NOT NULL,          -- session ID
  psid      TEXT,                   -- parent session ID
  pid       TEXT,                   -- project ID
  provider  TEXT NOT NULL,          -- 정규화된 프로바이더 (표시용)
  model     TEXT NOT NULL,          -- 정규화된 모델
  agent     TEXT,                   -- 실행 에이전트
  initiator TEXT,                   -- 기원 에이전트
  depth     INTEGER DEFAULT 0,     -- 위임 깊이
  inp       INTEGER DEFAULT 0,     -- input tokens
  out       INTEGER DEFAULT 0,     -- output tokens
  reasoning INTEGER DEFAULT 0,     -- reasoning tokens
  cache_r   INTEGER DEFAULT 0,     -- cache read tokens
  cache_w   INTEGER DEFAULT 0,     -- cache write tokens
  think     INTEGER DEFAULT 0,     -- 분류: think
  chat      INTEGER DEFAULT 0,     -- 분류: chat
  code      INTEGER DEFAULT 0,     -- 분류: code
  tools     INTEGER DEFAULT 0,     -- 도구 호출 횟수
  cost      REAL DEFAULT 0         -- 추정 비용
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_sid ON events(sid);
CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider);
```

타임스탬프 규칙: **모든 내부 타임스탬프는 epoch milliseconds (ms)**로 통일한다.
OpenCode DB(`opencode.db`)도 ms 단위를 사용하므로 변환 없이 직접 비교 가능.
로컬 날짜 키(`YYYY-MM-DD`)는 `Intl.DateTimeFormat` 또는 사용자 타임존 기준 유틸 하나로 변환.

UPSERT 규칙:
```sql
INSERT INTO events (key, ts, ver, sid, ...) VALUES (?, ?, 1, ?, ...)
ON CONFLICT(key) DO UPDATE SET
  ts = excluded.ts,
  ver = ver + 1,
  inp = excluded.inp,
  out = excluded.out,
  reasoning = excluded.reasoning,
  cache_r = excluded.cache_r,
  cache_w = excluded.cache_w,
  think = excluded.think,
  chat = excluded.chat,
  code = excluded.code,
  tools = excluded.tools,
  cost = excluded.cost
WHERE excluded.inp + excluded.out > inp + out;  -- 토큰이 증가한 경우만 갱신
```

원자적 기록: **event UPSERT + rollup 갱신은 단일 SQLite 트랜잭션** 내에서 실행.
rollup 갱신은 UPSERT가 실제로 행을 변경한 경우(`changes() > 0`)에만 수행.

### 5.3 토큰 분류 기준

```
Think  = reasoning tokens
         Claude extended thinking, o1/o3 internal reasoning
         → message.tokens.reasoning 값 그대로

Chat   = 도구 호출이 없는 응답의 output tokens
         순수 대화, 설명, 질문 응답
         → toolCalls.length === 0 인 메시지의 output

Code   = 도구 호출이 포함된 응답의 output tokens
         bash, write, edit, glob, grep 등
         → toolCalls.length > 0 인 메시지의 output

Input  = input tokens (시스템 프롬프트 + 사용자 메시지)
         → message.tokens.input

Cache  = cache read + cache write tokens
         → message.tokens.cache.read + cache.write
```

### 5.4 집계 캐시 테이블 (SQLite)

```sql
-- rollups 테이블 (일별 집계 캐시)
CREATE TABLE IF NOT EXISTS rollups (
  date      TEXT NOT NULL,          -- 'YYYY-MM-DD' (사용자 타임존 기준)
  kind      TEXT NOT NULL,          -- 'provider', 'agent', 'total'
  name      TEXT NOT NULL,          -- 'anthropic', 'coder', '*'
  inp       INTEGER DEFAULT 0,
  out       INTEGER DEFAULT 0,
  think     INTEGER DEFAULT 0,
  chat      INTEGER DEFAULT 0,
  code      INTEGER DEFAULT 0,
  cache_r   INTEGER DEFAULT 0,     -- cache read tokens
  cache_w   INTEGER DEFAULT 0,     -- cache write tokens
  cost      REAL DEFAULT 0,
  count     INTEGER DEFAULT 0,     -- 요청 수
  PRIMARY KEY (date, kind, name)
);
```

rollup은 **파생 데이터**이므로 events 테이블로부터 언제든 재생성 가능.
`/omt rebuild` 명령어로 dirty day rollup을 재계산할 수 있다.

### 5.5 세션 그래프 + 상태 테이블 (SQLite)

```sql
-- sessions 테이블
CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  parent_id      TEXT,
  agent          TEXT,
  compacted_from TEXT,
  status         TEXT DEFAULT 'active'  -- 'active' | 'completed' | 'compacted'
);

CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_compacted ON sessions(compacted_from);

-- state 테이블 (key-value)
CREATE TABLE IF NOT EXISTS state (
  key   TEXT PRIMARY KEY,
  value TEXT  -- JSON string
);
-- budget, costBudget, configHash 등을 key-value로 저장
-- ⚠️ auth.json 토큰/API 키는 절대 저장하지 않음 (인메모리만 사용)
```

---

## 6. 설정

### 6.1 플러그인 등록

```jsonc
// opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-tokens"]
}
```

### 6.2 사이드바 위치

```jsonc
// opencode.json
{
  "widget": {
    "oh-my-tokens:usage": { "order": 0 }  // 0 = 최상단
  }
}
```

### 6.3 플러그인 설정

```jsonc
// opencode.json → experimental 또는 별도 config.json
{
  "experimental": {
    "oh-my-tokens": {
      "display": "normal",       // "compact" | "normal" | "extend"
      "unit": "tokens",          // "tokens" (기본) | "cost"
      "enrichment": "off",       // "off" (기본) | "auto" | "manual" | "opencode-quota"
      "toast": {
        "enabled": true,
        "durationMs": 9000
      },
      "budget": {
        "daily": 500000,
        "weekly": 3000000,
        "monthly": 10000000
      },
      "costBudget": {
        "daily": 5.00,
        "weekly": 25.00,
        "monthly": 100.00
      },
      "providers": {              // enrichment: "manual" 시 사용자 지정 한도
        "anthropic": { "budget": 500000, "unit": "tokens", "period": "monthly" },
        "openai":    { "budget": 1000000, "unit": "tokens", "period": "monthly" }
      },
      "lang": "auto",             // "auto" | "en" | "ko" | "ja" | "zh"
      "retention": 90             // 데이터 보관 기간 (일)
    }
  }
}
```

### 6.4 Enrichment 모드 설명

| 모드 | 동작 | 외부 호출 |
|---|---|---|
| `off` (기본) | 로컬 추적만. 사용량 누적 표시. 한도 없음 | 없음 |
| `auto` | auth.json 토큰으로 프로바이더 API 자동 조회. 한도+잔여량 표시 | 있음 (프로바이더 API) |
| `manual` | 사용자가 `providers`에 한도를 직접 입력. 로컬 사용량과 비교 | 없음 |
| `opencode-quota` | opencode-quota와 동일 데이터 소스 활용. Toast 중복 방지. 미설치/실패 시 `auto`로 자동 폴백. **네트워크 호출 중복 방지는 보장하지 않음** | 있음 (프로바이더 API) |

---

## 7. UI 설계

### 7.1 사이드바 — 3단계 디스플레이

OpenCode Sidebar Plugin API (`sidebar` hook)를 사용한다.
`items`에 함수를 전달하면 5초마다 자동 폴링하여 갱신된다.

**API 제약**: `SidebarPanelItem`은 `{ label: string, value?: string, status?: "success" | "warning" | "error" | "info" }` 형태만 지원.
프로그레스 바, 구분선, 정렬 등의 리치 레이아웃은 불가능하므로 **행 기반 key-value** 형태로 설계한다.
리치 뷰(ASCII 차트, 분류별 상세 등)는 `/omt` 명령어에서 제공한다.

#### Compact (3행) — 좁은 화면, 집중 모드

| label | value | status |
|---|---|---|
| `Reply` | `🧠820 💬0 ⌨️1.8K` | `info` |
| `Session` | `42.0K tok` | `info` |
| `Today` | `128.5K / 500K (26%)` | status에 따라 동적 |

status 결정: 예산 0-60% → `success`, 60-80% → `warning`, 80%+ → `error`, 예산 미설정 → `info`

#### Normal (7~10행) — 일상 사용 (기본값)

| label | value | status |
|---|---|---|
| `Reply` | `🧠820 💬0 ⌨️1.8K` | `info` |
| `Session` | `42.0K tok` | `info` |
| `anthropic` | `93.2K tok (72%)` | `info` |
| `openai` | `31.0K tok (24%)` | `info` |
| `copilot` | `5.2K tok (4%)` | `info` |
| `coder` | `3.5K tok` | `info` |
| `task ×3` | `38.5K tok` | `info` |
| `Today` | `128.5K tok` | status 동적 |
| `Rate` | `14.2K/h (avg 9.8K/h)` | 150% 초과 시 `warning` |

#### Extended (12~16행) — 비용 최적화, 주간 리뷰

Normal의 모든 행 + 아래 추가:

| label | value | status |
|---|---|---|
| `🧠 think` | `28.4K (22%)` | `info` |
| `💬 chat` | `14.2K (9%)` | `info` |
| `⌨️ code` | `86.9K (56%)` | `info` |
| `📥 input` | `22.1K (14%)` | `info` |
| `📦 cache` | `5.8K (3%)` | `info` |
| `This Week` | `892.0K tok` | `info` |
| `This Month` | `3.2M tok` | `info` |
| `Budget` | `128.5K/500K day` | status 동적 |

#### unit: "cost" 모드 시

모든 value 뒤에 달러 비용을 병기한다. 예: `93.2K tok ($1.84)`
예산 표시도 달러 기준으로 전환한다.

### 7.2 Toast — 응답 후 알림

```
╭─ oh-my-tokens ─────────────────────────╮
│ 🧠 820  💬 0  ⌨️ 1.8K  = 2.6K tok      │
│ anthropic / claude-sonnet-4            │
╰────────────────────────────────────────╯
```

- `noReply: true` + `ignored: true` → 컨텍스트 오염 제로
- `toastDurationMs` 설정 가능
- 비활성화 가능 (`toast.enabled: false`)

### 7.3 슬래시 명령어

| 명령어 | 표시 내용 |
|---|---|
| `/omt` | 오늘 사용량 + 예산 + 에이전트별 요약 (리치 ASCII 포함) |
| `/omt agents` | 에이전트별 + Agent×Model 크로스 분석 |
| `/omt trend` | 7일 추세 ASCII 차트 + WoW 변화율 |
| `/omt export [json\|csv]` | 데이터 내보내기 |
| `/omt status` | 진단 (감지된 프로바이더, 저장소 크기, 가격 데이터 신선도) |
| `/omt rebuild` | rollup 재계산 (events 테이블에서 재생성) |

모든 명령어 출력은 `noReply: true` + `ignored: true`.

리치 뷰 예시 (`/omt` 출력):
```
oh-my-tokens — Today's Summary
═══════════════════════════════════════
PROVIDERS
  anthropic ██████████████░░ 72%   93.2K tok ($1.84)
  openai    █████░░░░░░░░░░ 24%   31.0K tok ($0.62)
  copilot   █░░░░░░░░░░░░░░  4%    5.2K tok
═══════════════════════════════════════
BREAKDOWN
  🧠 think   28.4K (22%)   💬 chat   14.2K (9%)
  ⌨️  code    86.9K (56%)   📥 input  22.1K (14%)
═══════════════════════════════════════
BUDGET  128.5K / 500K daily  ████░░ 25.7%  ✓
```

---

## 8. 에이전트 / 서브에이전트 추적

### 8.1 귀속 모델

```
에이전트 귀속 (Attribution) — 두 가지 관점

실행 귀속 (Execution): 토큰을 직접 소비한 에이전트
  → message.mode 값

기원 귀속 (Initiator): 위임 체인의 최상위 에이전트
  → session.get()으로 parentID 조회 → 루트까지 추적
```

### 8.2 서브에이전트 집계

```
[User prompt]
    │
    ▼
  Coder Agent (메인)                  → depth: 0
    │  input: 2K, output: 1.5K
    │
    ├── Task Agent #1 (서브)          → depth: 1
    │     input: 8K, output: 3K
    │     └── Task Agent #1-1         → depth: 2
    │           input: 4K, output: 2K
    │
    └── Task Agent #2 (서브)          → depth: 1
          input: 6K, output: 2.5K
```

세션 그래프(sessions 테이블)에서 parent 관계를 추적하여 집계:

- 단일 세션 보기: 해당 세션의 이벤트만
- 하위 포함 보기: 재귀적으로 자식 세션까지 합산
- 프로젝트 전체 보기: 해당 project_id의 모든 세션

---

## 9. 프로바이더 변경 자동 감지

### 9.1 감지 메커니즘

```
매 응답 시 (경량, <1ms):
  config hash = hash(providers 설정 + 주요 환경변수)
  이전 hash와 비교 → 변경 시 Re-scan

감지 대상:
  - API 키 추가/제거 (opencode.json + 환경변수)
  - 프로바이더 on/off (providers.*.disabled)
  - 모델 변경 (현재 사용 중인 모델)
  - MCP 서버 추가 (mcpServers)
```

### 9.2 Hash 대상

```typescript
function configHash(): string {
  return quickHash(
    JSON.stringify(config.providers) +
    (process.env.ANTHROPIC_API_KEY ?? "") +
    (process.env.OPENAI_API_KEY ?? "") +
    (process.env.GEMINI_API_KEY ?? "") +
    (process.env.GITHUB_TOKEN ?? "") +
    (process.env.GROQ_API_KEY ?? "")
  );
}
```

---


## 10. 프로바이더 한도 감지 (Enrichment)

`enrichment: "auto"` 모드 시, OpenCode의 `auth.json`에 저장된 OAuth 토큰을 재사용하여 프로바이더별 한도/잔여량을 조회한다.

### 10.1 프로바이더별 API 엔드포인트

| 프로바이더 | API 엔드포인트 | 반환 데이터 | 인증 |
|---|---|---|---|
| **OpenAI (ChatGPT)** | `chatgpt.com/backend-api/wham/usage` | `used_percent`, 시간/주간 윈도우 | OAuth (auth.json) |
| **OpenAI (API)** | `/v1/organization/usage/completions` | 모델별 일별 토큰 사용량 | Admin API Key |
| **Anthropic** | `/v1/organizations/usage_report/messages` | 모델별·시간별 토큰 | Admin Key (`sk-ant-admin...`) |
| **GitHub Copilot** | `/users/{user}/settings/billing/premium_request/usage` | used/limit (Premium Requests) | PAT or OAuth |
| **Google Gemini** | `cloudquotas.googleapis.com/v1/projects/...` | 쿼터 정보 | GCP 프로젝트 |
| **Groq** | ❌ 없음 | 콘솔만 지원 | — |
| **xAI** | ❌ 없음 | 콘솔만 지원 | — |

### 10.2 Tier 감지 (응답 헤더 기반)

OpenCode SDK는 응답 헤더를 플러그인에 노출하지 않지만, 별도 API 호출로 헤더를 확인할 수 있다.

```typescript
// Anthropic: anthropic-ratelimit-tokens-limit 헤더로 tier 추론
function detectAnthropicTier(tokensLimit: number): string {
  if (tokensLimit <= 25_000)  return "free";
  if (tokensLimit <= 50_000)  return "build_1";
  if (tokensLimit <= 100_000) return "build_2";
  if (tokensLimit <= 200_000) return "build_3";
  if (tokensLimit <= 400_000) return "build_4";
  return "scale";
}

// OpenAI: x-ratelimit-limit-tokens 헤더로 tier 추론
function detectOpenAITier(tokensLimit: number): string {
  if (tokensLimit <= 500_000)    return "tier_1";
  if (tokensLimit <= 1_000_000)  return "tier_2";
  if (tokensLimit <= 2_000_000)  return "tier_3";
  if (tokensLimit <= 4_000_000)  return "tier_4";
  return "tier_5";
}
```

### 10.3 Enrichment 데이터 흐름

```
[auth.json] → 토큰 읽기 (인메모리만, DB 저장 금지)
    │
    ├── OpenAI:    wham/usage API → used_percent, 윈도우 정보
    ├── Anthropic: usage_report API → 일별 사용량
    ├── Copilot:   billing API → used/total 프리미엄 요청
    └── Gemini:    Cloud Quotas API → RPM/TPM 한도
    │
    ▼
[SQLite state 테이블]  (TTL: 5분, 토큰 자체는 저장 안 함)
    │
    ▼
[사이드바 / Toast]
```

### 10.4 사용량 표시 모드별 차이

사이드바 행 기반 표시:

| enrichment 모드 | label | value |
|---|---|---|
| `off` | `anthropic` | `128.5K tok` |
| `auto` | `anthropic` | `128.5K / 500K (25.7%)` |
| `manual` | `anthropic` | `128.5K / 500K (25.7%)` |
| `opencode-quota` | `anthropic` | `128.5K / 500K (25.7%)` |

`/omt` 명령어에서는 리치 뷰로 프로그레스 바와 Tier 정보를 포함하여 표시.

### 10.5 Copilot 한도 폴백

Copilot Premium Requests는 토큰이 아닌 "요청 수" 단위이므로:
- API로 `used`/`total` 조회 시도
- API 실패 시 하드코딩 폴백: `free:50, pro:300, pro+:1500, business:300, enterprise:1000`
- 사이드바에는 "프리미엄 요청" 단위로 별도 표시

### 10.6 opencode-quota 연동 모드

`enrichment: "opencode-quota"` 선택 시:

1. `opencode.json`의 `plugin` 배열에서 `opencode-quota` 설치 여부 확인
2. 설치됨 → opencode-quota와 동일한 데이터 소스 활용:
   - `opencode.db`에서 세션/메시지 직접 읽기 (bun:sqlite, readonly)
   - 프로바이더 API 조회 (OpenAI wham/usage, Copilot billing 등)
   - Toast 중복 방지: oh-my-tokens가 quota 정보를 통합 표시
3. 미설치 / 읽기 실패 → `"auto"` 모드로 자동 폴백
4. 폴백 시 사용자에게 Toast로 1회 알림: "opencode-quota 미감지, 자체 조회 모드로 전환"

**⚠️ 제한사항**: 플러그인 간 직접 통신 수단이 없으므로:
- Toast 중복 방지: **가능** (oh-my-tokens가 quota 정보를 통합 표시하면 opencode-quota의 Toast는 사용자가 비활성화)
- 프로바이더 API 호출 중복 방지: **보장 불가** (두 플러그인이 독립적으로 동일 API 호출 가능)
- 권장: opencode-quota 모드 사용 시 opencode-quota의 `enableToast: false` 설정 안내

**opencode.db 읽기 주의사항**:
- 모든 opencode.db 접근은 단일 readonly 어댑터(`storage/backfill.ts`)로 격리
- 시작 시 스키마 호환성 검증 (테이블/컬럼 존재 확인)
- 호환되지 않는 스키마 → soft fail → `"auto"` 모드로 폴백 + 경고 로그

---

## 11. 다중 세션 강건성

### 11.1 멱등 기록

```
event_key = session_id + ":" + message_id

SQLite UPSERT로 동일 키 이벤트를 최신 데이터로 갱신.
토큰이 증가한 경우만 갱신 (WHERE excluded.inp + excluded.out > inp + out).
ver 컬럼이 갱신 횟수를 추적.
```

### 11.2 동시 쓰기 안전

```
SQLite WAL 모드로 동시 읽기/쓰기 지원.
busy_timeout = 5000ms로 일시적 잠금 대기.
단일 writer + 다중 reader 구조.

핵심 불변식: event UPSERT + rollup 갱신 = 단일 트랜잭션.
  → 하나만 성공하고 나머지 실패하는 상황 방지.
  → rollup 갱신은 UPSERT가 행을 변경한 경우(changes() > 0)에만 수행.
```

### 11.3 시나리오별 안전성

| 시나리오 | 보장 메커니즘 |
|---|---|
| 같은 이벤트 중복 발행 | UPSERT (토큰 증가 시만 갱신) |
| 불완전 데이터 → 완전 데이터 | UPSERT ver 증가 + 조건부 갱신 |
| 서브에이전트 동시 실행 | SQLite WAL 모드 |
| 다중 터미널 동시 실행 | SQLite 파일 잠금 + busy_timeout |
| 세션 전환 (Ctrl+A) | session_id로 이벤트 격리 |
| Compaction 이중 계상 | sessions.compacted_from + 원본 보존 |
| 세션 재열기 (다음 날) | UPSERT 멱등성 |
| 플러그인 비활성 중 누락 | 시작 시 백필 (opencode.db에서 복구) |

### 11.4 Compaction 처리

```
Session X (compact 발생) → Session Y (새 세션)

1. sessions 테이블에서 X.status = "compacted", Y.compacted_from = X
2. X의 events는 건드리지 않음 (원본 보존)
3. Y의 요약 메시지 토큰은 별도 기록 (이중 계상 방지)
4. 집계 시: 모든 이벤트를 event key로 유일하게 합산
```

### 11.5 백필 (Backfill)

플러그인이 비활성이거나 크래시 후 재시작된 경우, 누락된 이벤트를 복구한다.

```
시작 시 1회 실행:
1. oh-my-tokens.db에서 가장 최근 event의 ts 조회
2. opencode.db에서 해당 ts 이후의 assistant 메시지 조회 (readonly)
3. 누락된 메시지를 events 테이블에 UPSERT
4. 영향받는 날짜의 rollup 재계산 (dirty day rebuild)
5. 백필 결과 로그: "N개 이벤트 복구됨"
```

`/omt rebuild` 명령어: events 테이블 전체에서 rollup을 재생성.
데이터 불일치 의심 시 수동 실행.

---

## 12. 성능

### 12.1 응답당 오버헤드

| 작업 | 소요 시간 (p50) | 소요 시간 (p95) | 빈도 |
|---|---|---|---|
| 토큰 분류 (think/chat/code) | ~0.01ms | ~0.05ms | 매 응답 |
| 프로바이더 정규화 | ~0.05ms | ~0.1ms | 매 응답 |
| config hash 비교 | ~0.1ms | ~0.2ms | 매 응답 |
| SQLite UPSERT + rollup (트랜잭션) | ~0.5ms | ~3ms | 매 응답 |
| Toast 포매팅 | ~0.5ms | ~1ms | 매 응답 |
| **합계** | **~1.2ms** | **~4.4ms** | |

p50 기준 single-digit ms. LLM 응답 대기 시간(3~60초) 대비 무시 가능.
WAL 체크포인트, 연결 웜업, lock 경합 시 p95까지 상승 가능.
Enrichment API 호출은 비동기이므로 critical path에 포함되지 않음.

### 12.2 저장 공간

| 항목 | 하루 (200회 응답) | 한 달 | 1년 |
|---|---|---|---|
| SQLite DB (WAL) | ~60KB | ~1.8MB | ~20MB |
| **합계** | ~60KB | ~1.8MB | **~20MB** |

### 12.3 추가 토큰/API 사용
```
추가 토큰 소비: 0 (LLM 호출 없음)
컨텍스트 윈도우 오염: 0 (noReply + ignored)
추가 API 호출 (enrichment 모드별):
  off            → 0 (external call 없음)
  auto           → 프로바이더당 1회 / 5분 (캐시 TTL)
  manual         → 0 (external call 없음)
  opencode-quota → auto와 동일 (프로바이더당 1회 / 5분, 중복 호출 가능)
```

---

## 13. 구현 우선순위

### Phase 0 — 프로젝트 셋업

- [ ] 프로젝트 초기화 (package.json, tsconfig.json)
- [ ] 플러그인 엔트리 포인트 (src/index.ts)
- [ ] 기본 빌드/테스트 파이프라인

### Phase 1 — Core (이벤트 수집 + 기록)

- [ ] SQLite 초기화: db.ts (연결 + WAL + busy_timeout + 마이그레이션)
- [ ] Event Pipeline: `message.updated`, `session.idle`, `session.compacted` 훅
- [ ] Classifier: think/chat/code 분류
- [ ] Recorder: SQLite UPSERT + rollup 갱신 (단일 트랜잭션)
- [ ] 프로바이더 표시 정규화: normalizer.ts (섹션 4.5)
- [ ] 기본 Toast (응답 후)
- [ ] 백필: backfill.ts (시작 시 opencode.db에서 누락 복구)

### Phase 2 — 사이드바

- [ ] Sidebar Panel 등록 (`sidebar` hook, order: 0)
- [ ] Compact 모드 (3행, label/value/status)
- [ ] Normal 모드 (7~10행, 프로바이더+에이전트)
- [ ] Extended 모드 (12~16행, 분류별+기간별)
- [ ] 표시 단위 전환 (tokens / cost)

### Phase 3 — 에이전트 추적

- [ ] Attribution: 실행/기원 귀속 (session.get()으로 parentID 조회)
- [ ] 세션 그래프 (parent/child, compaction)
- [ ] 서브에이전트 재귀 집계
- [ ] `/omt agents` 명령어

### Phase 4 — 분석

- [ ] Trends: 일별 추세, WoW 변화율
- [ ] 스파이크 감지 (Z-score > 2.0)
- [ ] Budget: 예산 한도 체크 + 알림
- [ ] `/omt trend` 명령어

### Phase 5 — 완성

- [ ] `/omt export` (JSON, CSV)
- [ ] `/omt status` (진단)
- [ ] `/omt rebuild` (rollup 재계산)
- [ ] 프로바이더 변경 자동 감지 (config hash)
- [ ] pricing.ts 가격 데이터 내장 + 가격 정규화 분리 (섹션 4.5)
- [ ] 문서화 (README, 설정 가이드)
- [ ] Enrichment: auth.json 토큰 읽기 (인메모리만) + 프로바이더 API 조회
- [ ] Enrichment 캐시 (TTL 5분)
- [ ] Enrichment: opencode-quota 연동 모드 + 자동 폴백 + opencode.db 어댑터

---

## 14. 기술 스택

| 항목 | 선택 |
|---|---|
| 언어 | TypeScript |
| 런타임 | Bun (OpenCode 내장) |
| 저장소 | SQLite (bun:sqlite, WAL 모드) |
| 외부 의존성 | 없음 (제로) |
| SDK | @opencode-ai/plugin (타입만) |
| 빌드 | Bun bundler |
| 테스트 | Bun test (또는 vitest) |

---

## 15. 참고 자료

- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins/)
- [OpenCode SDK — Sidebar API (Issue #5971)](https://github.com/anomalyco/opencode/issues/5971)
- [OpenCode — Widget Ordering (Issue #14858)](https://github.com/anomalyco/opencode/issues/14858)
- [opencode-quota](https://github.com/slkiser/opencode-quota) — Provider quota 추적 참고
- [opencode-token-monitor](https://github.com/Ainsley0917/opencode-token-monitor) — 사용량 분석 참고
- [models.dev](https://models.dev) — 가격 데이터 소스

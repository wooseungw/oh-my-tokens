# oh-my-tokens — 인프라 계획서

> CI/CD, 코드 품질, 릴리스 자동화, 오픈소스 커뮤니티 인프라

---

## 1. 개요

### 1.1 인프라 철학

| 원칙 | 설명 |
|---|---|
| **Node.js 호환 빌드** | tsc + vitest + npm 기반. Node.js 18/20/22 매트릭스 CI. Bun 런타임은 OpenCode 내에서만 |
| **단일 도구 선호** | Biome 하나로 format + lint 해결. Prettier + ESLint 조합 대신 단일 바이너리 |
| **릴리스 = 태그** | GitHub Release 생성 → npm publish 자동화. 수동 `npm publish` 금지 |
| **로컬 게이트 우선** | 커밋 전에 format + typecheck + test 통과 강제. CI는 이중 방어선 |
| **제로 런타임 의존성** | devDependencies만 허용. `dependencies: {}` 불변 |

### 1.2 opencode-quota 대비 차이점

| 항목 | opencode-quota | oh-my-tokens |
|---|---|---|
| Formatter | Prettier | **Biome** (format + lint 통합) |
| Linter | 없음 | **Biome** (TypeScript lint 규칙 포함) |
| Pre-commit | Husky + lint-staged (Prettier) | Husky + lint-staged (**Biome**) |
| CI 테스트 | CI에서 test 미실행 | **CI에서 test 실행** |
| Changelog | 없음 | **Conventional Commits + 자동 생성** |
| Dependabot | 없음 | **활성화** |
| bun:sqlite 테스트 | 타입 선언만 | **타입 선언 + 모킹 전략** |

---

## 2. 개발 환경

### 2.1 요구 사항

```
Node.js >= 18.0.0   (빌드, 테스트, CI)
npm >= 9.0.0        (패키지 관리)
```

플러그인 런타임은 OpenCode의 Bun 환경이지만, 빌드/테스트/CI는 Node.js 호환으로 유지한다.
`bun:sqlite`는 타입 선언(`src/bun-sqlite.d.ts`)으로 tsc를 통과시키고, 테스트에서는 모킹한다.

### 2.2 devDependencies

```jsonc
{
  "devDependencies": {
    "@opencode-ai/plugin": "^1.1.14",   // SDK 타입 (런타임에 포함 안 됨)
    "typescript": "^5.8.0",              // 타입체크 + 빌드
    "@biomejs/biome": "^1.9.0",          // format + lint (단일 바이너리)
    "vitest": "^4.0.0",                  // 테스트 러너
    "husky": "^9.1.0",                   // Git hook 관리
    "lint-staged": "^16.0.0"             // 커밋 시 변경 파일만 format
  },
  "dependencies": {}  // 반드시 비어 있어야 함
}
```

총 devDependency: **6개**. opencode-quota(7개) 대비 동등하되 Biome가 Prettier + lint 기능을 대체.

---

## 3. 로컬 품질 게이트

### 3.1 Pre-commit Hook (Husky)

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/h"

npx lint-staged
npm run typecheck
npm test
```

커밋 전 3단계 검증: **포맷 → 타입체크 → 테스트**. 실패 시 커밋 차단.

### 3.2 lint-staged 설정

```jsonc
// .lintstagedrc
{
  "*.{ts,tsx,js,mjs,json,md}": "biome check --write --no-errors-on-unmatched"
}
```

Biome의 `check --write`가 format + lint 수정을 한 번에 수행.

### 3.3 수동 실행 명령어

```sh
npm run format          # Biome format (전체)
npm run lint            # Biome lint (전체)
npm run check           # Biome format + lint (전체, 수정 없이 검사만)
npm run typecheck       # tsc --noEmit
npm test                # vitest run
npm run build           # tsc
```

---

## 4. CI 파이프라인

### 4.1 CI 워크플로우 (`ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  quality:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18.x, 20.x, 22.x]
      - uses: actions/checkout@v4
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
        run: npm ci
        run: npx biome ci .
        run: npm run typecheck
        run: npm test
        run: npm run build
```

opencode-quota 대비 개선:
 **크로스플랫폼 CI**: `ubuntu + windows + macos` 3개 OS × Node.js 3버전 = 9개 조합
 **`npm test` CI에서 실행** (opencode-quota는 CI에서 test 미실행)
 **Biome CI 모드** (`biome ci`는 수정 없이 위반만 보고, CI에 적합)

### 4.2 CI에서 bun:sqlite 처리

`bun:sqlite`는 Bun 런타임에서만 존재하는 내장 모듈이다.
Node.js CI 환경에서는 다음 전략으로 처리한다:

1. **타입체크**: `src/bun-sqlite.d.ts` 타입 선언이 `tsc`를 통과시킴
2. **빌드**: tsc가 `.js`로 트랜스파일. `import("bun:sqlite")`는 그대로 유지 (런타임 해석은 Bun이 담당)
3. **테스트**: `bun:sqlite`를 사용하는 모듈은 vitest에서 모킹 (섹션 6 참조)

---

## 5. CD 파이프라인

### 5.1 릴리스 워크플로우 (`publish-npm.yml`)

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          fetch-tags: true

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org/
          cache: npm

      # 1. 태그에서 버전 추출 → package.json 동기화
      - name: Sync version from release tag
        run: |
          TAG="${{ github.event.release.tag_name }}"
          VERSION="${TAG#v}"
          npm version "$VERSION" --no-git-tag-version --allow-same-version

      # 2. 버전 일치 검증
      - name: Verify version
        run: node scripts/verify-release-version.mjs

      # 3. 품질 검증 (typecheck + test + build)
      - name: Install
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      # 4. npm 배포 (provenance 포함)
      - name: Publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --access public --provenance

      # 5. package.json 버전 커밋 반영
      - name: Commit version sync
        run: |
          TAG="${{ github.event.release.tag_name }}"
          VERSION="${TAG#v}"
          if git diff --quiet -- package.json package-lock.json; then
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package.json package-lock.json
          git commit -m "chore(release): sync version to ${VERSION}"
          git fetch origin main
          git rebase origin/main
          git push origin HEAD:main
```

### 5.2 릴리스 흐름

```
개발자가 GitHub에서 Release 생성 (태그: v0.1.0)
    │
    ▼
publish-npm.yml 트리거
    ├── 태그에서 버전 추출 → package.json 동기화
    ├── typecheck + test + build 검증
    ├── npm publish --provenance (서명된 배포)
    └── package.json 버전 커밋 → main 브랜치 반영
    │
    ▼
npm 레지스트리에 oh-my-tokens@0.1.0 배포 완료
```

### 5.3 필요한 GitHub Secrets

| Secret | 용도 | 설정 위치 |
|---|---|---|
| `NPM_TOKEN` | npm publish 인증 | Repository → Settings → Secrets |

npm 토큰은 **Automation** 타입 사용 (2FA 우회 가능, CI 전용).

### 5.4 npm Provenance

`--provenance` 플래그로 npm에 빌드 출처를 증명한다:
- 어떤 커밋에서 빌드되었는지
- 어떤 GitHub Actions 워크플로우에서 실행되었는지
- 빌드 환경의 투명성 보장

npm 패키지 페이지에 "Published with provenance" 배지가 표시된다.

---

## 6. 테스트 전략

### 6.1 테스트 구조

```
tests/
├── setup.ts                    # 글로벌 설정 (bun:sqlite 모킹 등)
├── unit/
│   ├── classifier.test.ts      # think/chat/code 분류 로직
│   ├── normalizer.test.ts      # 프로바이더 정규화
│   ├── formatter.test.ts       # 토큰/비용 포매팅
│   ├── recorder.test.ts        # UPSERT 로직 (SQLite 모킹)
│   └── budget.test.ts          # 예산 한도 계산
├── integration/
│   ├── pipeline.test.ts        # 이벤트 → 분류 → 기록 흐름
│   └── sidebar.test.ts         # 사이드바 행 생성
└── fixtures/
    ├── messages.ts             # 테스트용 메시지 데이터
    └── sessions.ts             # 테스트용 세션 데이터
```

### 6.2 vitest 설정

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/bun-sqlite.d.ts"],
    },
  },
});
```

### 6.3 bun:sqlite 모킹 전략

```typescript
// tests/setup.ts
import { vi } from "vitest";

// bun:sqlite는 Node.js에 없으므로 모킹
vi.mock("bun:sqlite", () => {
  const mockStatement = {
    all: vi.fn(() => []),
    get: vi.fn(() => null),
    run: vi.fn(),
  };

  class MockDatabase {
    constructor() {}
    query() { return mockStatement; }
    exec(sql: string) {}
    close() {}
    transaction(fn: Function) { return fn; }
  }

  return { Database: MockDatabase };
});
```

SQLite 연동 테스트가 필요한 경우:
- **방법 A**: `better-sqlite3`를 devDependency로 추가하여 테스트 전용 SQLite 사용
- **방법 B**: 별도 `bun test` 스크립트로 Bun 환경에서 통합 테스트 실행
- **권장**: 방법 A — CI에서도 실행 가능

### 6.4 테스트 커버리지 목표

| 모듈 | 커버리지 목표 | 이유 |
|---|---|---|
| classifier.ts | 95%+ | 핵심 분류 로직, 엣지 케이스 다수 |
| normalizer.ts | 95%+ | 프로바이더 매핑 정확도 중요 |
| recorder.ts | 90%+ | UPSERT 조건 검증 |
| formatter.ts | 90%+ | 표시 포맷 정확도 |
| budget.ts | 90%+ | 예산 초과 판단 정확도 |
| sidebar.ts | 80%+ | UI 로직, 모드별 행 수 검증 |
| pipeline.ts | 80%+ | 통합 흐름, 이벤트 라우팅 |
| enrichment/* | 70%+ | 외부 API 의존, 모킹 복잡 |

---

## 7. 코드 품질

### 7.1 Biome 설정

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": "warn"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noImplicitAnyLet": "error"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      }
    }
  },
  "files": {
    "ignore": ["node_modules", "dist", "*.min.json"]
  }
}
```

핵심 규칙:
- `noExplicitAny: "error"` — `as any`, `any` 타입 금지 (PLAN.md 원칙)
- `noUnusedVariables/Imports: "error"` — 불필요한 코드 차단
- `noExcessiveCognitiveComplexity: "warn"` — 복잡한 함수 경고

### 7.2 TypeScript 설정

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

opencode-quota와 동일한 설정. `strict: true` 필수.

---

## 8. 커뮤니티 인프라

### 8.1 파일 구조

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml          # 버그 리포트 양식
│   ├── feature_request.yml     # 기능 요청 양식
│   └── config.yml              # 빈 이슈 비활성화
├── pull_request_template.md    # PR 체크리스트
├── workflows/
│   ├── ci.yml                  # CI (PR + main push)
│   └── publish-npm.yml         # CD (릴리스 → npm)
├── dependabot.yml              # 의존성 자동 업데이트
└── FUNDING.yml                 # (선택) 스폰서 링크
```

### 8.2 Bug Report Template

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug report
description: Report a bug in oh-my-tokens
title: "[bug]: "
labels:
  - bug
body:
  - type: checkboxes
    id: checks
    attributes:
      label: Pre-flight checks
      options:
        - label: I searched existing issues and did not find a duplicate.
          required: true
        - label: I verified this on the current OpenCode release.
          required: true

  - type: input
    id: opencode_version
    attributes:
      label: OpenCode version
      placeholder: "1.2.15"
    validations:
      required: true

  - type: input
    id: plugin_version
    attributes:
      label: oh-my-tokens version
      placeholder: "0.1.0"
    validations:
      required: true

  - type: textarea
    id: summary
    attributes:
      label: Bug summary
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Configure ...
        2. Run ...
        3. Observe ...
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true

  - type: textarea
    id: logs
    attributes:
      label: Relevant logs/output
      description: Paste /omt status output when relevant.
      render: shell
```

### 8.3 Feature Request Template

```yaml
# .github/ISSUE_TEMPLATE/feature_request.yml
name: Feature request
description: Propose a new feature
title: "[feature]: "
labels:
  - enhancement
body:
  - type: checkboxes
    id: checks
    attributes:
      label: Pre-flight checks
      options:
        - label: I searched existing issues and did not find a duplicate.
          required: true

  - type: textarea
    id: problem
    attributes:
      label: Problem statement
    validations:
      required: true

  - type: textarea
    id: proposal
    attributes:
      label: Proposed change
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      placeholder: |
        - [ ] ...
```

### 8.4 PR Template

```markdown
## Summary

Describe the change and why it is needed.

## Linked Issue

Use `Fixes #...` or `Refs #...` when available.

## Quality Checklist

- [ ] `npm run check` passes (Biome format + lint)
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] No new `any` types introduced
- [ ] Tests added/updated for changed behavior
- [ ] README updated for user-facing changes
```

### 8.5 Issue Config

```yaml
# .github/ISSUE_TEMPLATE/config.yml
blank_issues_enabled: false
contact_links:
  - name: Contribution Guidelines
    url: https://github.com/<owner>/oh-my-tokens/blob/main/CONTRIBUTING.md
    about: Review contribution policy and PR checklist.
```

---

## 9. 보안

### 9.1 Dependabot

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      dev-dependencies:
        patterns:
          - "*"
    open-pull-requests-limit: 5
```

devDependency만 있으므로 보안 리스크는 낮지만, 자동 업데이트로 최신 상태 유지.

### 9.2 npm Provenance

CD 파이프라인에서 `--provenance` 사용 (섹션 5.4 참조).
빌드 출처 증명으로 supply chain attack 방어.

### 9.3 Secret 관리

| 항목 | 저장 위치 | 접근 방법 |
|---|---|---|
| NPM_TOKEN | GitHub Secrets | CD 워크플로우에서만 사용 |
| auth.json 토큰 | 사용자 로컬 | 인메모리만, DB 저장 금지 (PLAN.md §10.3) |
| API 키 | 환경변수 | 코드에 하드코딩 금지 |

### 9.4 .gitignore

```gitignore
node_modules/
dist/

# Logs
*.log
npm-debug.log*

# OS / editors
.DS_Store
.vscode/
.idea/

# Build artifacts
*.tsbuildinfo
coverage/

# Secrets
.env
.env.*
.npmrc

# OpenCode local
opencode.json
oh-my-tokens.db
oh-my-tokens.db-wal
oh-my-tokens.db-shm

# Reference / scratch
references/
AGENTS.md
```


### 9.5 .gitattributes

Windows에서의 줄바꿈(CRLF) 문제를 방지하기 위해 줄바꿈 정규화 설정:

```gitattributes
# 줄바꿈 정규화 — 모든 텍스트 파일을 LF로 통일
* text=auto eol=lf

# 바이너리 파일은 변환 금지
*.png binary
*.jpg binary
*.ico binary
*.db binary
*.db-wal binary
*.db-shm binary
```

이 설정으로:
- 모든 OS에서 Git이 체크아웃 시 LF로 통일
- Windows에서도 CRLF가 리포지토리에 들어가지 않음
- SQLite DB 파일은 바이너리로 처리하여 손상 방지
---

## 10. 버전 관리

### 10.1 Semantic Versioning

```
MAJOR.MINOR.PATCH

0.x.x  — 초기 개발 (API 불안정)
1.0.0  — 첫 안정 릴리스
```

- **MAJOR**: 설정 스키마 호환 깨짐, DB 마이그레이션 필요
- **MINOR**: 새 기능 추가 (새 enrichment 모드, 새 명령어)
- **PATCH**: 버그 수정, 성능 개선

### 10.2 Conventional Commits

커밋 메시지 형식:

```
<type>(<scope>): <description>

feat(sidebar): add extended display mode
fix(recorder): handle missing reasoning tokens
chore(ci): add Node.js 22 to matrix
docs(readme): add enrichment configuration guide
test(classifier): add edge case for empty toolCalls
refactor(normalizer): split display/pricing normalization
```

| type | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `chore` | 빌드, CI, 의존성 등 |
| `docs` | 문서 변경 |
| `test` | 테스트 추가/수정 |
| `refactor` | 기능 변경 없는 코드 개선 |
| `perf` | 성능 개선 |

### 10.3 Changelog

GitHub Release 생성 시 자동 생성되는 release notes 사용.
GitHub의 "Generate release notes" 기능이 PR 목록 + contributor를 자동 포함.

별도 CHANGELOG.md 파일은 유지하지 않음 (GitHub Releases가 canonical source).

---

## 11. 브랜치 보호

### 11.1 main 브랜치 규칙

| 규칙 | 설정 |
|---|---|
| PR 필수 | main에 직접 push 차단 |
| 리뷰 필수 | 최소 1명 승인 (선택, 초기에는 불필요) |
| 상태 체크 필수 | `quality (18.x)`, `quality (20.x)`, `quality (22.x)` 통과 |
| 브랜치 최신화 | 머지 전 main과 동기화 필수 |
| Force push 차단 | main에 force push 금지 |

### 11.2 브랜치 전략

```
main          ← 안정 브랜치, 릴리스 대상
  └── feat/*  ← 기능 개발 브랜치
  └── fix/*   ← 버그 수정 브랜치
```

단일 패키지이므로 단순한 GitHub Flow 사용. develop 브랜치 불필요.

---

## 12. 스크립트

### 12.1 package.json scripts

```jsonc
{
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "format": "biome format --write .",
    "lint": "biome lint --write .",
    "check": "biome check --write .",
    "check:ci": "biome ci .",
    "prepare": "husky",
    "verify:release-version": "node scripts/verify-release-version.mjs",
    "pricing:refresh": "node scripts/refresh-modelsdev-pricing.mjs"
  }
}
```

### 12.2 유틸리티 스크립트

```
scripts/
├── verify-release-version.mjs   # 릴리스 태그 ↔ package.json 버전 일치 검증
└── refresh-modelsdev-pricing.mjs # models.dev에서 가격 데이터 갱신 → src/data/
```

---

## 13. 구현 순서 (인프라)

인프라 파일은 Phase 0 (프로젝트 셋업)에서 코드와 함께 생성한다.

### Phase 0에서 생성할 인프라 파일

| 파일 | 설명 |
|---|---|
| `package.json` | 메타데이터 + scripts + devDependencies |
| `tsconfig.json` | TypeScript strict 설정 |
| `biome.json` | Biome format + lint 규칙 |
| `vitest.config.ts` | 테스트 설정 |
| `.gitignore` | 무시 파일 목록 |
| `.lintstagedrc` | lint-staged → Biome 연동 |
| `.husky/pre-commit` | 커밋 전 품질 검증 |
| `src/bun-sqlite.d.ts` | bun:sqlite 타입 선언 |
| `LICENSE` | MIT |

### Phase 5 (완성)에서 생성할 인프라 파일

| 파일 | 설명 |
|---|---|
| `.github/workflows/ci.yml` | CI 워크플로우 |
| `.github/workflows/publish-npm.yml` | CD 워크플로우 |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | 버그 리포트 양식 |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | 기능 요청 양식 |
| `.github/ISSUE_TEMPLATE/config.yml` | 이슈 설정 |
| `.github/pull_request_template.md` | PR 체크리스트 |
| `.github/dependabot.yml` | 의존성 자동 업데이트 |
| `CONTRIBUTING.md` | 기여 가이드 |
| `README.md` | 사용자 문서 |
| `scripts/verify-release-version.mjs` | 버전 검증 스크립트 |

---

## 14. 참고 자료

- [Biome — Getting Started](https://biomejs.dev/guides/getting-started/)
- [Husky — Documentation](https://typicode.github.io/husky/)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
- [GitHub Actions — setup-node](https://github.com/actions/setup-node)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [opencode-quota CI/CD](https://github.com/slkiser/opencode-quota/tree/main/.github) — 참고 구현

# Contributing to oh-my-tokens

Thank you for your interest in contributing to oh-my-tokens! This guide will help you get started.

## Prerequisites

- **Node.js >= 18.0.0** (for development, testing, and CI)
- **npm >= 9.0.0** (for package management)

The plugin runs on Bun in OpenCode, but development uses Node.js for compatibility.

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/<owner>/oh-my-tokens.git
   cd oh-my-tokens
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## Development Commands

- **`npm run check`** — Run Biome format + lint checks (no modifications)
- **`npm run typecheck`** — Type-check with TypeScript
- **`npm test`** — Run tests with vitest
- **`npm run build`** — Compile TypeScript to JavaScript

## Code Style

- **Formatting & Linting**: Biome handles both. Run `npm run check` before committing.
- **No `any` types**: Biome enforces `noExplicitAny: "error"`. Use proper types instead.
- **Conventional Commits**: Use the format `<type>(<scope>): <description>`
  - `feat(sidebar): add extended display mode`
  - `fix(recorder): handle missing reasoning tokens`
  - `test(classifier): add edge case for empty toolCalls`

## Pull Request Process

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** and commit with conventional commit messages

3. **Run quality checks locally**
   ```bash
   npm run check      # Biome format + lint
   npm run typecheck  # Type checking
   npm test           # Tests
   npm run build      # Build
   ```

4. **Push and create a PR** with a clear description

5. **Use the PR template** (`.github/pull_request_template.md`) to ensure all checks are covered

## Testing

- Tests use **vitest** and are located in `tests/`
- **bun:sqlite** is mocked in tests since Node.js doesn't have it natively
- Add tests for any new behavior or bug fixes
- Aim for high coverage on core modules (classifier, normalizer, recorder, formatter, budget)

## Git Hooks

Pre-commit hooks (via Husky) automatically run:
1. Biome format + lint on changed files
2. TypeScript type checking
3. Test suite

If any check fails, the commit is blocked. Fix the issues and try again.

## Questions?

- Check existing issues and discussions
- Review the [INFRA.md](./INFRA.md) for detailed infrastructure documentation
- Open an issue with the "question" label if needed

Happy coding! 🚀

# Contributing to JSON-Chizu

Thank you for helping improve JSON-Chizu.

## Ways to Contribute

- Report bugs and edge cases.
- Propose UX or API improvements.
- Submit pull requests with tests and docs updates.

## Development Setup

```bash
bun install
bun run build:core
bun run dev:json
```

## Before Opening a Pull Request

Run the relevant checks from the repository root:

```bash
bun run typecheck:core
bun run test:core
bun run typecheck:vue
bun run typecheck:json
```

If your changes affect runtime behavior, include or update tests where practical.

## Project Conventions

- Keep changes focused and avoid unrelated refactors in the same pull request.
- In Vue templates, use kebab-case for named `v-model` args that map to camelCase model keys.
- When using `jsonc-parser`, use `parse(...)` for runtime values and reserve `parseTree(...)` for diagnostics/path mapping.

## Pull Request Checklist

- Code compiles and type-checks.
- Tests pass for impacted packages.
- New behavior is documented.
- Breaking changes are called out clearly.

## Community Standards

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

# JSON-Chizu

a Bun workspace monorepo for interactive tree and graph visualization.

It currently contains:

- `@shiko/core`: framework-agnostic TypeScript graph/tree layout and controller logic.
- `@shiko/vue`: Vue bindings and canvas components built on top of `@shiko/core`.
- `@shiko/json-chizu`: a Vue app for exploring JSON as an interactive visual map.

## Requirements

- Bun `>= 1.3.9`

## Quick Start

```bash
bun install
bun run build:core
bun run dev:json
```

Open the local URL shown by Vite to use the JSON-Chizu app.

## Workspace Scripts

From the repository root:

- `bun run build:core`: build `packages/shiko-core`.
- `bun run typecheck:core`: type-check `packages/shiko-core`.
- `bun run test:core`: run tests for `packages/shiko-core`.
- `bun run build:vue`: type-check/build `packages/shiko-vue`.
- `bun run typecheck:vue`: type-check `packages/shiko-vue`.
- `bun run dev:json`: run the JSON-Chizu app in development mode.
- `bun run build:json`: build core package, then build the JSON-Chizu app.
- `bun run typecheck:json`: type-check the JSON-Chizu app.

## Repository Layout

```text
apps/
  json-chizu/
packages/
  shiko-core/
  shiko-vue/
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

To report vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

This project is licensed under the GNU General Public License v3.0.
See [LICENSE](LICENSE) for the full text.

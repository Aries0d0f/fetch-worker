# Contributing

Thanks for considering a contribution!

## Getting started

```sh
bun install
bun run build
bun run test
```

## Workflow

1. Fork and branch from `main`.
2. Make your change, and add or update tests under `test/` — `bun run test`
   should stay green.
3. Run `bun run lint` and `bun run typecheck` before opening a PR.
4. If your change affects the published package (a fix, a feature, a breaking
   change), add a changeset:

   ```sh
   bun run changeset
   ```

   Pick the appropriate bump (patch/minor/major) and describe the change from
   a consumer's point of view — that description becomes the changelog entry.

5. Open a PR. CI runs lint, typecheck, tests, and a build on every PR.

## Reporting bugs

Please include a minimal reproduction (a small snippet or a link to a
repro repo) along with the environment (browser/Node version, bundler).

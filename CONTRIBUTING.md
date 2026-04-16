# Contributing to Virtual Frame

Thank you for your interest in contributing to Virtual Frame! We welcome bug reports, feature requests, documentation improvements, and code contributions.

## License

Virtual Frame is **source-available** software, not open-source. By contributing, you agree that your contributions will be governed by the project's [Source Available License](./LICENSE) and assigned to Level 0x40 Labs.

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** — this repo is a pnpm workspace (the version is pinned via `packageManager` in `package.json`; `corepack enable` will pick it up automatically).
- **[Vite+](https://viteplus.dev)** — the root `dev`, `build`, `typecheck`, `docs:*`, and `example:*` scripts invoke the `vp` CLI directly (e.g. `vp run -r build`). Vite+ is the unified toolchain that drives our workspace task running, so you need it installed before any of those scripts will work.

Install Vite+ once, globally, then open a new terminal session so `vp` is on your `PATH`:

```sh
# macOS / Linux
curl -fsSL https://vite.plus | bash

# Windows (PowerShell)
irm https://vite.plus/ps1 | iex
```

Verify the install:

```sh
vp help
```

In CI, prefer the [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) action instead of the shell installer.

### Setup

1. Fork the repository.
2. Clone your fork and install dependencies:
   ```sh
   pnpm install
   ```
3. Create a branch for your change:
   ```sh
   git checkout -b feat/my-change
   ```

## Development

### Project Structure

This is a pnpm monorepo. Key directories:

- `packages/core` — Core library (`virtual-frame`)
- `packages/store` — Shared store (`@virtual-frame/store`)
- `packages/react`, `packages/vue`, `packages/svelte`, `packages/solid`, `packages/angular` — Framework bindings
- `packages/next`, `packages/nuxt`, `packages/sveltekit`, `packages/solid-start`, `packages/tanstack-start`, `packages/react-router`, `packages/react-server`, `packages/analog` — Meta-framework integrations
- `examples/` — Example applications
- `e2e/` — Playwright end-to-end suite
- `docs/` — VitePress documentation site

### Common Commands

```sh
pnpm build          # Build all packages
pnpm test           # Run unit tests (vitest, watch mode)
pnpm test:run       # Run unit tests once
pnpm test:e2e       # Run the Playwright end-to-end suite
pnpm typecheck      # Type-check all packages
pnpm lint           # Lint with oxlint
pnpm format         # Format with oxfmt
pnpm format:check   # Verify formatting (CI uses this)
pnpm dev            # Start development servers for all examples
```

### Running Examples

Use the root npm scripts to start examples:

```sh
pnpm example:react        # React host + remote
pnpm example:vue          # Vue
pnpm example:svelte       # Svelte
pnpm example:solid        # Solid
pnpm example:angular      # Angular
pnpm example:nextjs-app   # Next.js App Router host + remote
pnpm example:nextjs-pages # Next.js Pages Router host + remote
pnpm example:rspack-mf    # Rspack Module Federation host + remote
pnpm example:vanilla      # Vanilla JS
```

A complete list lives in the root `package.json` under `scripts`.

## Pull Request Workflow

### 1. Conventional Commits for the PR title

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/). The `pr-title` CI check enforces it. Examples:

- `feat(react): add useFrame hook`
- `fix(core): handle null bridge target`
- `docs(getting-started): clarify isolation modes`
- `chore(deps): bump vitest to 4.1.0`

Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.

Individual commit messages within the PR can be free-form — only the PR title is enforced (since merges are squashed against it).

### 2. Add a changeset

If your PR changes any code shipped from `packages/`, add a changeset:

```sh
pnpm changeset
```

The CLI will ask which packages changed, what kind of bump (`patch` / `minor` / `major`), and a one-line user-facing summary. Commit the generated `.changeset/*.md` file alongside your code change.

PRs that genuinely don't ship code (docs-only, CI-only, internal refactors) can be exempted by applying the **`skip-changeset`** label to the PR.

See [`.changeset/README.md`](./.changeset/README.md) for details on how Changesets drives our release process.

### 3. CI must be green

Every PR runs:

- `lint` — `pnpm format:check && pnpm lint`
- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test:run`
- `build` — `pnpm build`
- `e2e` — `pnpm test:e2e`
- `changeset-check` — verifies a changeset is present (or `skip-changeset` is set)
- `pr-title` — Conventional Commits validation
- `dependency-review` — flags vulnerable or disallowed-licensed new deps
- `CodeQL` — static security analysis

Run the relevant subset locally before pushing.

### 4. Submit the PR

- Open a pull request against `main`.
- Fill in the [PR template](./.github/pull_request_template.md) — Summary, Motivation, Test Plan are mandatory.
- Keep commits focused: one logical change per commit when feasible.

## Releases

We use [Changesets](https://github.com/changesets/changesets). When PRs containing changesets land on `main`, the **Release** workflow opens (or updates) a "Version Packages" PR. Merging that PR publishes affected packages to npm with provenance, pushes git tags, and creates GitHub Releases. Maintainers handle the merge of the Version Packages PR.

## Reporting Issues

- Use [GitHub Issues](https://github.com/level0x40/virtual-frame/issues/new/choose) for bug reports and feature requests — the templates will guide you through the required information.
- For general questions or discussion, use [GitHub Discussions](https://github.com/level0x40/virtual-frame/discussions).
- For **security vulnerabilities**, do not open a public issue — see [SECURITY.md](./SECURITY.md).

## Code Reuse

This project's source code is **not available for reuse** in other projects without prior written approval from Level 0x40 Labs. See the [LICENSE](./LICENSE) for details. If you'd like to use portions of the code outside of this project, contact us at hello@level0x40.com.

## Questions?

Open a [Discussion](https://github.com/level0x40/virtual-frame/discussions) or reach out at hello@level0x40.com.

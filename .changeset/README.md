# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets) and is how Virtual Frame ships package versions.

## When you need to add a changeset

Add a changeset whenever a pull request modifies code shipped from any package under [`packages/`](../packages). You do **not** need a changeset for changes confined to:

- `docs/`, `examples/`, `e2e/`
- Repository tooling (`.github/`, root config files)
- Tests that don't change runtime behavior

If you're not sure, add one — it costs nothing.

## How to add one

From the repo root:

```sh
pnpm changeset
```

The CLI will:

1. Ask which packages changed.
2. Ask whether each change is `patch`, `minor`, or `major` (follow [semver](https://semver.org/)).
3. Ask for a short, user-facing summary — this becomes a line in the published `CHANGELOG.md` and the GitHub Release notes.

Commit the generated `.changeset/<random-name>.md` file alongside your code change in the same PR.

## What happens after merge

When your PR merges to `main`, the **Release** workflow opens (or updates) a "Version Packages" PR that:

- Bumps the affected package versions according to the changesets it found.
- Generates `CHANGELOG.md` entries.
- Removes the consumed `.changeset/*.md` files.

A maintainer reviews and merges that PR; merging it triggers the same workflow to publish to npm with provenance, push tags, and create the corresponding GitHub Releases.

## Skipping the changeset check

If a PR genuinely needs no version bump (docs, internal-only refactor, CI), apply the `skip-changeset` label and the `changeset-check` job will pass.

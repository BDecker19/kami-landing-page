# Agent / contributor workflow

**`main` is the source of truth.** Everything that ships should land on `main`.

## Where to work

- **Small or low-risk changes** (copy, assets, one-off fixes, tiny CSS): work **directly on `main`**. Commit and push; keep history linear and boring.
- **Larger, riskier, or isolated work** (big refactors, experiments, anything you’d want to revert without touching other in-flight work): use a **short-lived branch** off `main`, open a PR, merge when ready.

Default assumption: if you’re unsure, **`main` is fine** until the change stops being small.

## Branches

- Keep branches **narrow and short-lived** — one purpose, merge soon, delete after merge.
- After a PR is merged: **delete the branch locally and on the remote** so we don’t accumulate cruft.

```bash
git checkout main && git pull
git branch -d <branch>              # local
git push origin --delete <branch>   # remote (if still there)
```

- Avoid long-running personal or “WIP forever” branches. Rebase or merge from `main` often if you must use a branch, but prefer finishing and merging.

## What we’re optimizing for

Less **git archaeology** (stale locals, mystery remotes, “which branch was real?”). More **small batches on `main`**, branches only when they earn their keep.

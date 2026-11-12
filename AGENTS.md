# vimflowy — agent notes

- Workflowy+vim-style outliner. Maintained by @phaze9 (see README.md).
- Node 22 required (.nvmrc). Install with `npm install --legacy-peer-deps` (.npmrc sets `legacy-peer-deps=true`; needed around the React 17 / react-scripts 5 peer conflicts).
- Verify: `npm run verify` = tslint + `tsc --noEmit` + mocha tests (`npm test`). There are two linters in play: the `lint` npm script runs **tslint** (tslint.json), while package.json also carries an `eslintConfig` (react-app) used by `npx eslint`. Keep both clean — a change can pass one and fail the other. Known lint gotcha: see `MEMORY.md`.
- Storage backends: HTML5 local storage (default), in-memory, Firebase, socket server. Docs in `docs/storage/README.md`.
- CI: `.github/workflows/develop.yml` (GitHub Actions). Docker deployment via `Dockerfile` -> hub.docker.com/r/vimflowy/vimflowy.

## Repository Guidance

### Pulling upstream changes

- The local `master` branch tracks `origin/master` (`https://github.com/ezflowy/ezflowy`).
- The remote named `upstream` points to `https://github.com/phaze9/vimflowy`.
- When asked to pull upstream changes, merge `upstream/master` explicitly and do not rebase:

  ```sh
  git pull --no-rebase upstream master
  ```

- Check `git status --short --branch` before and after the pull. Preserve unrelated modified or untracked files; if they conflict with the merge, stop and report the conflict instead of discarding them.
- After a successful merge, push to the tracked fork only when the user asks:

  ```sh
  git push origin master
  ```

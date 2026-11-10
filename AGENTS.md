# Repository Guidance

## Pulling upstream changes

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

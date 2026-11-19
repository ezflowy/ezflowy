# ezflowy Project Memory

## LLM Chat provider settings dialog

- The LLM Chat plugin is implemented in `src/plugins/llm_chat/index.ts`.
- Provider URL, model name, and API key are configured together in one form dialog rather than three sequential `window.prompt` calls.
- Dialog styles live in `src/plugins/llm_chat/index.sass`.
- Defaults remain `https://api.openai.com/v1/chat/completions` and `gpt-5.4`.
- Leaving the API key field blank preserves the currently stored key.
- Clicking the model-name field retrieves a fresh model list from the configured provider while keeping manual model entry available.
- Model discovery derives OpenAI-compatible `/models` endpoints from chat-completions, completions, and responses URLs; Ollama `/api/chat` and `/api/generate` URLs use `/api/tags`.
- Model discovery sends the entered or stored API key as a Bearer token and accepts both OpenAI-style `data` arrays and Ollama-style `models` arrays.
- The model picker shows loading and provider-error states, sorts and deduplicates returned model names, and closes after a selection or an outside click.
- The dialog supports Save, Cancel, Escape, backdrop cancellation, initial focus, and focus restoration.
- The editor's document-level Safari paste workaround normally focuses the hidden `#paste-hack` element after clicks; this caused dialog inputs to gain focus briefly and then lose it.
- The paste workaround now ignores form controls, editable elements, labels, and dialogs, while the LLM dialog also stops its internal clicks from bubbling to document-level handlers.
- Keyboard tabbing and initial dialog focus were unaffected; the fix targets mouse-click focus retention.
- On 2026-11-19, applied the existing LLM Agent configuration paste fix to Chat: the dialog overlay stops `paste` event propagation without preventing the default action, preserving native input paste while keeping the outline's global paste handler from intercepting it.
- Paste fix verification: `npm run verify` passed under Node 22 (TSLint, TypeScript, all 279 tests), targeted ESLint passed, and `git diff --check` was clean. Live browser paste behavior was not independently tested.
- Verification completed on 2026-11-11: TypeScript typecheck passed, all 259 tests passed, and the production build completed with existing warnings.
- Initial implementation was committed as `4ab9eb4 Combine LLM settings prompts into dialog` and pushed to `origin/master`.
- `ezflowy.iml` (IntelliJ module file) is now tracked; committed as `dd23bed Add IntelliJ IDEA module file` on 2026-11-17.

## LLM Agent plugin

- The LLM Agent plugin is implemented in `src/plugins/llm_agent/` and registered from `src/plugins/index.ts`.
- Ctrl/Cmd-Shift-A sends the current node to Codex, Cursor Agent, or Hermes through the local bridge in `server/agent_server.ts`.
- The bridge uses each CLI's structured streaming mode, binds to `127.0.0.1:7331` by default, and requires the token printed at startup or supplied through `EZFLOWY_AGENT_TOKEN`.
- Agent status and response lines are updated incrementally in rows owned by the run, so edits elsewhere in the outline remain independent.
- The run's output nodes are flat siblings under the prompt node (as of 2026-11-18): `Agent status` and `Agent response` are at the same level (not nested), and the final `Agent resume` or follow-up node is appended as a sibling after them, so streamed replies no longer render with double indentation. The edit lock covers both the status and response subtrees.
- Successful turns with a session ID leave a visible `Agent resume [provider:session-id]` node with an editable `Next prompt:` child; triggering that child resumes the same provider session.
- Failed turns never create a resume node, even if the provider emitted a session ID before exiting. The plugin displays stderr as `Agent error:` in the response area and in a follow-up child; if the agent streamed partial output first, that output is preserved ahead of the error.
- Completion behavior is centralized in the exported `agentCompletion` helper and covered in `test/tests/llm_agent.ts`, including empty failures, partial-output failures, and successful resumability.
- Prompt serialization uses `buildAgentPrompt`: include the selected node and all descendants in outline order as nested list items, including collapsed descendants. Strip `Next prompt:` or `Answer:` from the selected node's text.
- If any descendant starts with `Agent resume`, send only the selected node's text and exclude all descendants. The selected node itself does not trigger this rule: selecting the only `Agent resume` node includes all its descendants. Follow-ups still use the selected node's or nearest ancestor's saved provider session.
- Verification on 2026-11-16: `npm run verify` passed with 270 tests and targeted ESLint passed for prompt serialization. An additional selected-resume regression test subsequently passed with all 6 LLM Agent tests.
- Permission requests are not auto-approved. The initial implementation uses safe turn-based follow-ups; native mid-turn request/response support requires provider-specific Hermes gateway, Codex app-server, and Cursor ACP adapters.
- Start the bridge with `npm run agent-server`; configure its URL, token, working directory, and default provider through the LLM Agent plugin action.
- The settings dialog now opens on every run, not just when the working directory or token was missing (first-run-only dialog removed on 2026-11-17): the run action always shows the prefilled dialog before running, canceling aborts the run, and submitted values are saved. `QUICKSTART.md` was updated to describe the per-run dialog.
- The original leading-blank fix (2026-11-17) was incomplete: metadata events and split whitespace chunks could consume its one-shot state. Superseded by the per-run streaming filter and renderer filtering described below; restart the bridge after updating.
- Verification on 2026-11-11: TypeScript typecheck passed, all 259 tests passed, and the production build completed with the repository's existing warnings. Live socket binding was blocked by the execution sandbox and was not browser-tested.
- Failure-display fix verification on 2026-11-15: `npm run verify` passed (TSLint, TypeScript, and all 267 tests), targeted ESLint passed, and `git diff --check` was clean.

## Codex permissions and line-based output filtering (2026-11-19)

- Correction after review: `workspace-write` can still protect `.git`; the earlier claim that it grants writes to `.git/index.lock` was incorrect. The bridge now uses `--dangerously-bypass-approvals-and-sandbox` for fresh and resumed Codex runs, disabling Codex sandboxing and approval prompts as requested. Host permissions, credentials and any external sandbox still apply. Restart `npm run agent-server` after updating.
- The exported `commandFor` in `server/agent_server.ts` has a regression test asserting the complete fresh and resume arguments, including the bypass flag.
- Bypass correction verification on 2026-11-19: `npm run verify` passed with Node 22 (TSLint, TypeScript and 277 Mocha tests); targeted ESLint for `server/agent_server.ts` and `test/tests/llm_agent.ts` and `git diff --check` passed. Installed Codex CLI help accepts the bypass flag for fresh and resumed runs. Live bridge commit/push behavior has not been tested; the running bridge must be restarted to use the new arguments.
- Blank-line filtering moved from `stripLeadingBlankLines` to the shared module `src/shared/agent_output.ts`, which the bridge and the plugin both import. `filterAgentText(text, state)` removes leading, interior and trailing blank lines independently of chunk boundaries (separators and indentation are held in `state.pending` until a nonblank line arrives, even across chunk splits) while preserving content indentation. Empty metadata text does not advance the state; a fresh state is created for every run. `agentResponseLines(text)` splits agent output into nonblank lines only.
- The bridge streams `filterAgentText` over JSON text events, the non-JSON fallback, and the close-time stdout flush; `stripLeadingBlankLines` remains exported but now only marks the run `started` once nonblank text arrives, so metadata and split blank chunks no longer disable leading stripping early.
- The plugin renders response output as nonblank outline rows via `agentResponseLines`, deleting surplus rows when a repaint has fewer lines than before instead of leaving blank rows.
- `test/tests/llm_agent.ts` uses `assert` (strict) for the new tests: `commandFor` sandbox args, `filterAgentText` across every chunk split and char-by-char, `agentResponseLines` nonblank filtering, and `stripLeadingBlankLines` staying unstarted through blank chunks.
- Verification on 2026-11-19: `npm run verify` passed (TSLint, TypeScript, 277 Mocha tests). Committed as `3d885c0 Run Codex in workspace-write sandbox and filter agent output by line` and pushed to `origin/master`.

## Agent response placement (2026-11-19)

- LLM Agent appends `Agent status` followed by `Agent response` after the triggering node's existing children, using the explicit child count as the insertion index.
- Passing `-1` to `Session.addBlocks` with multiple rows appends the first row but increments the next insertion index to `0`, placing the response before existing children. Use an explicit insertion index when appending this pair.
- Validation under Node 22.22.2: `npm run verify` passed (TSLint, TypeScript, 277 Mocha tests), targeted ESLint passed, and `git diff --check` passed. Live browser placement was not independently verified.

## Hermes history visibility (2026-11-17)

- Hermes defaults finite `chat -q` runs to source `oneshot`, which human history pickers hide. Read-only inspection of the installed Hermes implementation and local state database confirmed this source exists for saved runs; a missing picker entry does not mean the transcript was lost.
- `server/agent_server.ts` now adds `--source cli` for new Hermes conversations, making outline conversations eligible for `/resume` history. Resumed runs retain their original source and receive no creation-source override. Restart `npm run agent-server` after updating.
- Existing hidden conversations can be opened directly using `/resume SESSION_ID` in Hermes or `hermes --resume SESSION_ID` in a terminal. Copy the ID from the outline's `Agent resume [hermes:SESSION_ID]` node. This fix does not migrate existing session records.
- `src/plugins/llm_agent/QUICKSTART.md` documents the source selection, bridge restart, and older-session recovery.
- Validation under Node 22.22.2: `npm run verify` passed (TSLint, TypeScript, 271 Mocha tests), targeted ESLint on the bridge passed, fresh/resumed Hermes argument checks passed, and `git diff --check` was clean. Live conversation creation and picker visibility were not tested.

## LLM response edit locks

- LLM Chat no longer blocks the global key queue while awaiting `fetch`; the submitted node and its descendants are locked while the rest of the outline remains editable.
- LLM Chat replaces the submitted node's children when the response arrives, so its lock protects that entire subtree and is bypassed only for the plugin-owned replacement.
- LLM Agent locks the generated status and response sibling subtrees while streaming. Newly generated response rows are added to the active lock, while the source prompt and unrelated outline rows remain editable.
- LLM Agent releases its output lock on completion, bridge failure, or socket closure. The final resume and `Next prompt:` rows are editable after completion.
- Edit locks are enforced at the mutation layer, including structural edits, undo, and redo. Mutations report their affected rows so operations that would indirectly alter a locked descendant are also rejected.
- Locked rows receive a shared visual cue: shaded background, reduced opacity, lock glyph, `not-allowed` cursor, tooltip, and `aria-readonly` state.
- `Session` emits `editLocksChanged`; the visible `SessionComponent` subscribes directly and refreshes immediately when rows are locked or unlocked, without requiring a click.
- Verification on 2026-11-12: `npm run verify` passed with 260 tests, and the production build succeeded with the existing Firebase source-map and LLM Chat ESLint warnings.
- `ezflowy.iml` (IntelliJ module file) is now tracked; committed as `dd23bed Add IntelliJ IDEA module file` on 2026-11-17.

## Agent completion lock repaint (2026-11-19)

- Agent completion released edit locks and emitted `editLocksChanged`, but `BlockComponent.shouldComponentUpdate` skipped unchanged cached blocks, leaving their lock cues visible until another update.
- `SessionComponent` now increments `editLocksVersion` on lock notifications and passes it through every nested `BlockComponent`. A revision change forces blocks to repaint even when their cached rows and cursor state are unchanged.
- `test/tests/line_repaint.ts` covers invalidation on lock acquisition and release, propagation to nested blocks, and retained render skipping when the revision is unchanged.
- Validation under Node 22.22.2: `npm run verify` passed (TSLint, TypeScript, 278 Mocha tests); targeted ESLint and `git diff --check` passed. Live browser behavior was not independently verified.

## Agent status and streaming repaint (2026-11-17)

- Replacing existing Agent status or response text updated the document cache without notifying the outline to render. New response rows triggered lock-change notifications, so repaint appeared to depend on adding lines or clicking in the outline.
- `Document.setLine()` now emits `lineChanged` after updating the cache and persisting the text. `SessionComponent` subscribes through its existing promise-debounced update function and removes the listener on unmount. This covers status replacements and character streaming within existing rows.
- Regression coverage in `test/tests/line_repaint.ts` checks notifications with current cached text, unchanged row structure, and listener cleanup. Live browser repaint has not been independently verified.
- Validation under Node 22.22.2: `npm run verify` passed (TSLint, TypeScript, 272 Mocha tests), targeted ESLint passed, and `git diff --check` passed. `npm run build` succeeded with the existing Firebase source-map warnings and outdated Browserslist-data notice.

## Lint gotcha (upstream vimflowy)

- `src/assets/ts/components/settings/backendSettings.tsx` builds a Firebase console URL with a *literal* `'${firebaseProjectId}'` placeholder string (not interpolation). That trips ESLint `no-template-curly-in-string`; inlining it or concatenating the pieces just shifts the warning (e.g. `no-useless-concat`). Fixed with an inline `eslint-disable-next-line` comment documenting the placeholder.

## Selected-subtree Markdown export (2026-11-14)

- `Ctrl+M` copies the selected node and all of its descendants to the system clipboard as Markdown. The selected node is plain top-level text; its children use Markdown list syntax, with deeper descendants represented as nested list items. The command works in both NORMAL and INSERT modes, preserves inline Markdown in node text, and includes children even when the selected node is collapsed. Cmd+M is intentionally not mapped because macOS reserves it for minimizing the front window, so browsers may not deliver it to vimflowy.
- The core action is `copy-selected-as-markdown`. Its default mappings live in `src/assets/ts/configurations/vim.ts`; the action is registered in `src/assets/ts/definitions/meta.ts`.
- `Session.exportSelectedMarkdown()` serializes from `session.cursor.row`, emits the selected node text without a list marker, and formats descendants with two-space nested-list indentation. The action emits the `copyToClipboard` session event, which `src/assets/ts/app.tsx` handles through the asynchronous Clipboard API with the legacy `execCommand('copy')` method as a fallback. The async API is required because subtree serialization completes after the original keyboard event, when browsers can reject the legacy copy operation. The UI reports whether the copy succeeded. This explicit export is independent of the yank register and the `copyToClipboard` client setting.
- Regression coverage is in `test/tests/export.ts` and exercises both Ctrl in NORMAL mode and Cmd in INSERT mode. The implementation and clipboard fix passed `npm run verify` (TSLint, TypeScript, and the full Mocha suite) plus ESLint on the changed source files.
- Keep this feature in core unless it grows into a configurable export suite. Plugins can register actions and mappings, but the browser clipboard bridge is a core UI concern and plugins are disabled by default.

## Search responsiveness (2026-11-15)

- Global (`/`) and local (`Ctrl+/`) search retain the existing case-insensitive, whitespace-separated substring semantics. The default result cap is 50 rows.
- `Menu` debounces queries by 120 ms, assigns a generation to each query, ignores stale full and partial results, exposes a `searching` state, and emits `updated` when progressive or final results arrive. It also tracks which query generation produced the visible results: `Ctrl+J`, `Ctrl+K`, and Enter act immediately once the current scan has published progressive results, but still flush a pending debounced query when no current results exist. This allows jumping to matches before a long scan finishes without selecting stale results. Disposing a menu cancels pending work.
- `Document.search()` accepts candidate paths, cancellation and progress callbacks. It yields to the browser event loop every 250 visited rows. Extended queries reuse previous candidates only when the earlier result set was exhaustive; never refine from a capped result set because matching rows beyond the cap would be lost.
- The search UI publishes matches progressively and displays `Searching...` while a scan is active. Each loaded `CachedRowInfo` stores normalized lowercase text for case-insensitive search. Structural, collapsed-state and plugin-data cache updates preserve that string; `setLine()` rebuilds it when row text changes. Case-sensitive search continues to read the original line.
- These changes improve perceived responsiveness but do not change the remote-search architecture: socket-server and direct Firebase searches still traverse document rows through the client. A future backend search RPC and persistent index are documented as scaling directions in `docs/search.md`, not as implemented behavior.
- Regression coverage is in `test/tests/menu_responsiveness.ts` and `test/tests/search_cache.ts`, with existing behavior covered by `test/tests/search.ts`. The progressive-navigation implementation passed `npm run verify` with 264 Mocha tests, ESLint on changed files, and `git diff --check`.

## Search result breadcrumbs (2026-11-16)

- Global and local search results show a breadcrumb trail above each matching row, from the document root (home icon) through the row's parent. The matching row remains directly below the trail.
- Search reuses `BreadcrumbsComponent` and its line-rendering hooks. Its optional `compact` prop uses 12px text and a 3px bottom margin; normal page headers retain 20px text and a 10px margin. Search breadcrumbs are informational, with no click handler.
- `definitions/menu.tsx` loads ancestor text when preparing results and supplies an optional `MenuResult.breadcrumbs` node, rendered by the menu component. Other menu results are unaffected.
- Validation: `npm run verify` passed with 264 Mocha tests; ESLint on all four changed source files and `git diff --check` passed. Browser appearance has not been independently verified.

## Lint cleanup (2026-11-16)

- Removed the redundant `/* globals describe, it */` (and `afterEach` in `test/testcase.ts`) headers: ESLint's `react-app/jest` preset already provides the mocha globals, so the JSDoc `globals` comment made ESLint report `@typescript-eslint/no-redeclare` for every test file. 66 ESLint warnings across 33 files dropped to 0.
- Also fixed the remaining warnings: unnecessary `\\.` / `\\'` escapes (`src/plugins/llm_chat/index.ts`, `src/plugins/examples/index.ts`) and the mixed `&&`/`||` in the LLM chat reply extraction, parenthesized to `(message && message.content) || ''`.
- Verified: `npm run verify` (tslint + tsc + 269 tests) passed, ESLint is clean, `npm run build` completed with only the pre-existing Firebase source-map warnings, and `git diff --check` is clean.

## Agent error output and cleanup (2026-11-19)

- Failed LLM Agent runs keep the error and any partial output under `Agent response`, remove standalone `session_id:` metadata from the error, and no longer append a duplicate error under the source prompt.
- When a failed run has a session ID, its `Agent resume [provider:session-id]` row and editable `Next prompt:` child are added under `Agent status [error · provider]`. Successful runs retain their existing resume placement; failures without a session ID do not offer resume.
- Completion, bridge error messages, connection errors and premature socket closure use one guarded finalizer. It cancels pending render timers, finishes rendering, and releases output edit locks and closes the socket in `finally`; later terminal messages cannot duplicate completion output. Rendered rows extend the lock only while it is active.
- Regression coverage in `test/tests/llm_agent.ts` includes session-only errors and both single-line and multiline Hermes input-required/detached messages, preserving the error text while removing redundant session metadata and allowing resume with a known session ID.
- Validation under Node 22.22.2: `npm run verify` passed (TSLint, TypeScript, 279 Mocha tests); targeted ESLint and `git diff --check` passed. Live Hermes and browser behavior were not independently tested.

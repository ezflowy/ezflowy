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
- Verification completed on 2026-11-11: TypeScript typecheck passed, all 259 tests passed, and the production build completed with existing warnings.
- Initial implementation was committed as `4ab9eb4 Combine LLM settings prompts into dialog` and pushed to `origin/master`.
- Preserve the unrelated untracked `ezflowy.iml` file.

## LLM Agent plugin

- The LLM Agent plugin is implemented in `src/plugins/llm_agent/` and registered from `src/plugins/index.ts`.
- Ctrl/Cmd-Shift-A sends the current node to Codex, Cursor Agent, or Hermes through the local bridge in `server/agent_server.ts`.
- The bridge uses each CLI's structured streaming mode, binds to `127.0.0.1:7331` by default, and requires the token printed at startup or supplied through `EZFLOWY_AGENT_TOKEN`.
- Agent status and response lines are updated incrementally in rows owned by the run, so edits elsewhere in the outline remain independent.
- Successful turns with a session ID leave a visible `Agent resume [provider:session-id]` node with an editable `Next prompt:` child; triggering that child resumes the same provider session.
- Failed turns never create a resume node, even if the provider emitted a session ID before exiting. The plugin displays stderr as `Agent error:` in the response area and in a follow-up child; if the agent streamed partial output first, that output is preserved ahead of the error.
- Completion behavior is centralized in the exported `agentCompletion` helper and covered in `test/tests/llm_agent.ts`, including empty failures, partial-output failures, and successful resumability.
- Permission requests are not auto-approved. The initial implementation uses safe turn-based follow-ups; native mid-turn request/response support requires provider-specific Hermes gateway, Codex app-server, and Cursor ACP adapters.
- Start the bridge with `npm run agent-server`; configure its URL, token, working directory, and default provider through the LLM Agent plugin action.
- Verification on 2026-11-11: TypeScript typecheck passed, all 259 tests passed, and the production build completed with the repository's existing warnings. Live socket binding was blocked by the execution sandbox and was not browser-tested.
- Failure-display fix verification on 2026-11-15: `npm run verify` passed (TSLint, TypeScript, and all 267 tests), targeted ESLint passed, and `git diff --check` was clean.

## LLM response edit locks

- LLM Chat no longer blocks the global key queue while awaiting `fetch`; the submitted node and its descendants are locked while the rest of the outline remains editable.
- LLM Chat replaces the submitted node's children when the response arrives, so its lock protects that entire subtree and is bypassed only for the plugin-owned replacement.
- LLM Agent locks only the generated status and response subtree while streaming. Newly generated response rows are added to the active lock, while the source prompt and unrelated outline rows remain editable.
- LLM Agent releases its output lock on completion, bridge failure, or socket closure. The final resume and `Next prompt:` rows are editable after completion.
- Edit locks are enforced at the mutation layer, including structural edits, undo, and redo. Mutations report their affected rows so operations that would indirectly alter a locked descendant are also rejected.
- Locked rows receive a shared visual cue: shaded background, reduced opacity, lock glyph, `not-allowed` cursor, tooltip, and `aria-readonly` state.
- `Session` emits `editLocksChanged`; the visible `SessionComponent` subscribes directly and refreshes immediately when rows are locked or unlocked, without requiring a click.
- Verification on 2026-11-12: `npm run verify` passed with 260 tests, and the production build succeeded with the existing Firebase source-map and LLM Chat ESLint warnings.
- Preserve the unrelated untracked `ezflowy.iml` file.

## Lint gotcha (upstream vimflowy)

- `src/assets/ts/components/settings/backendSettings.tsx` builds a Firebase console URL with a *literal* `'${firebaseProjectId}'` placeholder string (not interpolation). That trips ESLint `no-template-curly-in-string`; inlining it or concatenating the pieces just shifts the warning (e.g. `no-useless-concat`). Fixed with an inline `eslint-disable-next-line` comment documenting the placeholder.

## Selected-subtree Markdown export (2026-11-14)

- `Ctrl+M` and `Cmd+M` copy the selected node and all of its descendants to the system clipboard as Markdown. The selected node is plain top-level text; its children use Markdown list syntax, with deeper descendants represented as nested list items. The command works in both NORMAL and INSERT modes, preserves inline Markdown in node text, and includes children even when the selected node is collapsed.
- The core action is `copy-selected-as-markdown`. Its default mappings live in `src/assets/ts/configurations/vim.ts`; the action is registered in `src/assets/ts/definitions/meta.ts`.
- `Session.exportSelectedMarkdown()` serializes from `session.cursor.row`, emits the selected node text without a list marker, and formats descendants with two-space nested-list indentation. The action emits the `copyToClipboard` session event, which `src/assets/ts/app.tsx` handles through the asynchronous Clipboard API with the legacy `execCommand('copy')` method as a fallback. The async API is required because subtree serialization completes after the original keyboard event, when browsers can reject the legacy copy operation. The UI reports whether the copy succeeded. This explicit export is independent of the yank register and the `copyToClipboard` client setting.
- Regression coverage is in `test/tests/export.ts` and exercises both Ctrl in NORMAL mode and Cmd in INSERT mode. The implementation and clipboard fix passed `npm run verify` (TSLint, TypeScript, and the full Mocha suite) plus ESLint on the changed source files.
- Keep this feature in core unless it grows into a configurable export suite. Plugins can register actions and mappings, but the browser clipboard bridge is a core UI concern and plugins are disabled by default.

## Search responsiveness (2026-11-15)

- Global (`/`) and local (`Ctrl+/`) search retain the existing case-insensitive, whitespace-separated substring semantics. The default result cap is 50 rows.
- `Menu` debounces queries by 120 ms, assigns a generation to each query, ignores stale full and partial results, exposes a `searching` state, and emits `updated` when progressive or final results arrive. Search movement and selection call `flush()` first so fast `Ctrl+J`, `Ctrl+K`, or Enter input still acts on the newest query. Disposing a menu cancels pending work.
- `Document.search()` accepts candidate paths, cancellation and progress callbacks. It yields to the browser event loop every 250 visited rows. Extended queries reuse previous candidates only when the earlier result set was exhaustive; never refine from a capped result set because matching rows beyond the cap would be lost.
- The search UI publishes matches progressively and displays `Searching...` while a scan is active. Each loaded `CachedRowInfo` stores normalized lowercase text for case-insensitive search. Structural, collapsed-state and plugin-data cache updates preserve that string; `setLine()` rebuilds it when row text changes. Case-sensitive search continues to read the original line.
- These changes improve perceived responsiveness but do not change the remote-search architecture: socket-server and direct Firebase searches still traverse document rows through the client. A future backend search RPC and persistent index are documented as scaling directions in `docs/search.md`, not as implemented behavior.
- Regression coverage is in `test/tests/menu_responsiveness.ts` and `test/tests/search_cache.ts`, with existing behavior covered by `test/tests/search.ts`. The implementation passed `npm run verify` with 263 Mocha tests, ESLint on changed files, and `git diff --check`.

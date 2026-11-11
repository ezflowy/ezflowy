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
- Completed turns leave a visible `Agent resume [provider:session-id]` node with an editable `Next prompt:` child; triggering that child resumes the same provider session.
- Permission requests are not auto-approved. The initial implementation uses safe turn-based follow-ups; native mid-turn request/response support requires provider-specific Hermes gateway, Codex app-server, and Cursor ACP adapters.
- Start the bridge with `npm run agent-server`; configure its URL, token, working directory, and default provider through the LLM Agent plugin action.
- Verification on 2026-11-11: TypeScript typecheck passed, all 259 tests passed, and the production build completed with the repository's existing warnings. Live socket binding was blocked by the execution sandbox and was not browser-tested.

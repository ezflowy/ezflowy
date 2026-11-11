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
- Verification completed on 2026-11-11: TypeScript typecheck passed, all 259 tests passed, and the production build completed with existing warnings.
- Initial implementation was committed as `4ab9eb4 Combine LLM settings prompts into dialog` and pushed to `origin/master`.
- Preserve the unrelated untracked `ezflowy.iml` file.

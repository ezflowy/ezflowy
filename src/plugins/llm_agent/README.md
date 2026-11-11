# LLM Agent

LLM Agent runs a local coding-agent CLI from the current outline node. It supports Codex, Cursor Agent, and Hermes Agent through the provider-neutral WebSocket bridge in `server/agent_server.ts`.

## Setup

Start the bridge before using the plugin:

```sh
npm run agent-server
```

The bridge listens only on `127.0.0.1` by default and prints a generated access token. In ezflowy's plugin settings, enable **LLM Agent**, run **Configure the LLM Agent bridge and provider**, and paste that token and the agent working directory. Set `EZFLOWY_AGENT_TOKEN` when starting the bridge if the token should remain stable across restarts.

Put a prompt in a node and press Ctrl-Shift-A (Cmd-Shift-A on macOS). Output is streamed into child nodes. The plugin stores the provider and resume ID in a visible `Agent resume [...]` node and adds an editable `Next prompt:` child. Edit that child and use the same shortcut to continue the conversation.

## Questions and permissions

The bridge deliberately does not auto-approve commands. It runs each turn in the agent's structured, non-interactive mode and then exits the CLI process. If an agent needs information or a permission its policy does not grant, its request or refusal remains in the outline. Answer it in `Next prompt:` and resume the saved conversation.

Native mid-turn approval controls are a future protocol extension: Hermes gateway requests, Codex app-server requests, and Cursor ACP requests should be normalized to a bridge `request` event. The plugin can then add an `Agent request [...]` node with an editable `Answer:` child and send a matching `respond` event. Until that exists, use each provider's configured safe policy; do not run the bridge with blanket approval or force flags merely to avoid a prompt.

Each run only updates the status and response rows it created. It does not replace the prompt subtree, so editing other parts of the outline remains safe while an agent is running.

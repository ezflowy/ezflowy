# LLM Agent

LLM Agent runs a local coding-agent CLI from the current outline node. It supports Codex, Cursor Agent, and Hermes Agent through the provider-neutral WebSocket bridge in `server/agent_server.ts`.

## Setup

Start the bridge before using the plugin:

```sh
npm run agent-server
```

The bridge listens only on `127.0.0.1` by default and prints a generated access token. In ezflowy's plugin settings, enable **LLM Agent**, run **Configure the LLM Agent bridge and provider**, and paste that token and the agent working directory. Set `EZFLOWY_AGENT_TOKEN` when starting the bridge if the token should remain stable across restarts.

To change the listen address, set `EZFLOWY_AGENT_PORT` (default `7331`) and `EZFLOWY_AGENT_HOST` (default `127.0.0.1`) when starting the bridge, for example `EZFLOWY_AGENT_PORT=8080 npm run agent-server`. Update the plugin's bridge URL to match, e.g. `ws://127.0.0.1:8080`.

Put a prompt in a node and press Ctrl-Shift-A (Cmd-Shift-A on macOS). The prompt includes the selected node and all descendants, including collapsed descendants, as nested list items. If any descendant is an `Agent resume` node, only the selected node’s text is sent; all descendants are excluded. Output is streamed into child nodes. The plugin stores the provider and resume ID in a visible `Agent resume [...]` node and adds an editable `Next prompt:` child. Edit that child (or add descendants beneath it) and use the same shortcut to continue the conversation.

## Provider history and resume

The outline's `Agent resume [provider:SESSION_ID]` node stores the provider's
session ID. Follow-ups continue that session through the same bridge. History
visibility also depends on the provider's own filters; a missing picker entry
does not necessarily mean the conversation was not saved. Use the same local
account and provider configuration as the bridge when looking for a session.

### Codex

The bridge starts `codex exec --sandbox workspace-write --json` without
`--ephemeral`, so sessions are persisted by default. Follow-ups use
`codex exec --sandbox workspace-write resume --json SESSION_ID`.

The sandbox flag is required: `codex exec` defaults to a read-only sandbox,
which cannot create `.git/index.lock`, so git commits and pushes fail.
`workspace-write` grants write access to the working directory and its
`.git`, while still blocking writes elsewhere on the machine. It is not the
same as `danger-full-access`, which also allows writes outside the workspace.
The interactive resume picker normally excludes these non-interactive runs.
To include them across working directories:

```sh
codex resume --include-non-interactive --all
```

`--include-non-interactive` includes exec sessions; `--all` removes the
working-directory filter. To open a known session directly:

```sh
codex resume SESSION_ID
```

These options were checked against the installed CLI help. See the
[Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference).

### Cursor Agent

The bridge starts `cursor-agent -p --output-format stream-json` and adds
`--resume SESSION_ID` for follow-ups. Cursor documents history and direct
resume commands:

```sh
cursor-agent ls
cursor-agent --resume SESSION_ID
```

The invocation follows the [Cursor CLI documentation](https://docs.cursor.com/en/cli/overview).
Local persistence and history visibility have not been verified: `cursor-agent`
was unavailable in the shell used for the check. Ensure it is on the bridge's
`PATH`. This describes CLI history; visibility in the Cursor editor was not
verified.

### Hermes

New conversations explicitly use `--source cli` so Hermes does not classify
them as `oneshot` automation hidden from human history pickers. Restart the
bridge after updating it. Browse conversations with `/resume` in Hermes, or
open a known session using `/resume SESSION_ID` or `hermes --resume SESSION_ID`.
The recent list shows only 10 sessions at a time.

Older one-shot sessions keep their original source when resumed and can remain
hidden. The plugin does not import or relabel existing provider history.
Source classification and titles are separate: a saved session can have no
title. See the [Hermes quickstart](QUICKSTART.md) for setup and recovery by ID.

## Questions and permissions

The selected node itself does not trigger descendant exclusion: selecting an `Agent resume` node includes its descendants unless another `Agent resume` node appears beneath it.

The bridge deliberately does not auto-approve commands. It runs each turn in the agent's structured, non-interactive mode and then exits the CLI process. If an agent needs information or a permission its policy does not grant, its request or refusal remains in the outline. Answer it in `Next prompt:` and resume the saved conversation.

Native mid-turn approval controls are a future protocol extension: Hermes gateway requests, Codex app-server requests, and Cursor ACP requests should be normalized to a bridge `request` event. The plugin can then add an `Agent request [...]` node with an editable `Answer:` child and send a matching `respond` event. Until that exists, use each provider's configured safe policy; do not run the bridge with blanket approval or force flags merely to avoid a prompt.

Each run only updates the status and response rows it created. It does not replace the prompt subtree, so editing other parts of the outline remains safe while an agent is running.

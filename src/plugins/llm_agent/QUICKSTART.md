# Hermes Agent quickstart

## 1. Verify Hermes

Confirm that the Hermes CLI is available in the terminal environment that will
run the bridge:

```sh
hermes --version
hermes chat -q "Reply with OK" --format stream-json
```

The bridge uses this structured output mode and invokes `hermes --resume` for
follow-up turns. New conversations use `--source cli` so Hermes includes them
in its `/resume` history instead of hiding them as one-shot automation.
Restart the bridge after updating it for this change to take effect.

Older conversations remain saved but may be hidden from the history picker.
Copy the session ID from the outline's `Agent resume [hermes:SESSION_ID]` node
and use `/resume SESSION_ID` in Hermes (or `hermes --resume SESSION_ID` from
the terminal) to open one directly.

The plugin does not migrate older history or fill missing session titles.
Hermes source classification and titles are separate: a visible saved session
may still have no title. The `/resume` recent list shows only 10 sessions at
a time. For Codex and Cursor history commands, see
[Provider history and resume](README.md#provider-history-and-resume).

## 2. Start the agent bridge

From the ezflowy repository, start the bridge with a stable secret token:

```sh
EZFLOWY_AGENT_TOKEN='choose-a-long-random-token' npm run agent-server
```

It should report that it is listening on `ws://127.0.0.1:7331`. The bridge
inherits its environment, including `PATH` and the Hermes model/provider
configuration, from this terminal.

If the bridge cannot find Hermes, ensure the directory containing the `hermes`
executable is in `PATH` before starting it:

```sh
PATH="/path/to/hermes/bin:$PATH" \
EZFLOWY_AGENT_TOKEN='choose-a-long-random-token' \
npm run agent-server
```

To run the bridge on a different port or host, set `EZFLOWY_AGENT_PORT` (default
`7331`) and `EZFLOWY_AGENT_HOST` (default `127.0.0.1`):

```sh
EZFLOWY_AGENT_PORT=8080 \
EZFLOWY_AGENT_TOKEN='choose-a-long-random-token' \
npm run agent-server
```

Whatever address you start the bridge on, use the same one as the plugin's
**Agent bridge WebSocket** value in step 3 (for the example above,
`ws://127.0.0.1:8080`).

## 3. Configure the plugin

In ezflowy:

1. Open **Settings > Plugins** and enable **LLM Agent**.
2. Return to the outline, create or select a node containing a prompt, and
   press `Cmd-Shift-A` on macOS or `Ctrl-Shift-A` on other platforms.
3. When you run the agent, the configuration dialog opens automatically. Set
   the fields as follows:

   - **Agent:** Hermes
   - **Agent bridge WebSocket:** `ws://127.0.0.1:7331`
   - **Agent bridge token:** the token used when starting the bridge
   - **Working directory:** the repository or directory in which Hermes should
     operate

The registered configuration action does not currently have a menu button or
default keyboard binding. The per-run configuration dialog is therefore the
normal way to configure the plugin; it opens on every run and shows the saved
values.

Hermes model and provider settings belong to Hermes itself; they are not
configured by the ezflowy plugin.

## 4. Run and resume Hermes

After saving the configuration, the selected prompt runs automatically. For
later prompts, place the cursor on the prompt node and press `Cmd-Shift-A` on
macOS or `Ctrl-Shift-A` on other platforms. Hermes output is
streamed into child nodes.

After a completed turn, ezflowy creates an `Agent resume [hermes:...]` node
with a `Next prompt:` child. Edit that child and use the same shortcut to
continue the saved Hermes session.

## Permissions

The bridge does not automatically approve commands or permission requests. If
Hermes stops because it needs information or permission, provide the answer in
`Next prompt:` and resume the session. Configure an appropriately safe Hermes
policy instead of launching it with blanket approval or force flags.

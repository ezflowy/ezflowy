import Path from '../../assets/ts/path';
import { PluginApi, registerPlugin } from '../../assets/ts/plugins';
import './index.sass';

type Provider = 'codex' | 'cursor' | 'hermes';
type Settings = { provider: Provider, bridgeUrl: string, bridgeToken: string, cwd: string };
type ResumeInfo = { provider: Provider, sessionId: string };

const pluginName = 'LLM Agent';
const resumePattern = /^Agent resume \[(codex|cursor|hermes):(.+)]$/;

async function getSettings(api: PluginApi): Promise<Settings> {
  const settings = await api.getData('settings', {
    provider: 'codex', bridgeUrl: 'ws://127.0.0.1:7331', bridgeToken: '', cwd: '',
  });
  return {
    provider: settings.provider || 'codex',
    bridgeUrl: settings.bridgeUrl || 'ws://127.0.0.1:7331',
    bridgeToken: settings.bridgeToken || '',
    cwd: settings.cwd || '',
  };
}

function settingsDialog(settings: Settings): Promise<Settings | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'llm-agent-settings__overlay';
    const dialog = document.createElement('div');
    dialog.className = 'llm-agent-settings';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = document.createElement('h2');
    title.textContent = 'Configure LLM Agent';
    dialog.appendChild(title);
    const form = document.createElement('form');
    const addField = (labelText: string, input: HTMLInputElement | HTMLSelectElement) => {
      const label = document.createElement('label');
      label.textContent = labelText;
      form.appendChild(label);
      form.appendChild(input);
    };
    const provider = document.createElement('select');
    ['codex', 'cursor', 'hermes'].forEach((name) => {
      const option = document.createElement('option');
      option.value = name; option.textContent = name === 'cursor' ? 'Cursor Agent' : `${name[0].toUpperCase()}${name.slice(1)}`;
      provider.appendChild(option);
    });
    provider.value = settings.provider;
    addField('Agent', provider);
    const bridge = document.createElement('input');
    bridge.type = 'url'; bridge.value = settings.bridgeUrl;
    addField('Agent bridge WebSocket', bridge);
    const bridgeToken = document.createElement('input');
    bridgeToken.type = 'password'; bridgeToken.value = settings.bridgeToken;
    bridgeToken.autocomplete = 'off';
    addField('Agent bridge token', bridgeToken);
    const cwd = document.createElement('input');
    cwd.type = 'text'; cwd.value = settings.cwd; cwd.placeholder = '/path/to/project';
    addField('Working directory', cwd);
    const actions = document.createElement('div');
    actions.className = 'llm-agent-settings__actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save';
    actions.appendChild(cancel); actions.appendChild(save); form.appendChild(actions);
    dialog.appendChild(form); overlay.appendChild(dialog); document.body.appendChild(overlay);
    const close = (value: Settings | null) => { overlay.remove(); resolve(value); };
    cancel.onclick = () => close(null);
    overlay.onmousedown = (event) => { if (event.target === overlay) { close(null); } };
    overlay.onkeydown = (event) => { event.stopPropagation(); if (event.key === 'Escape') { close(null); } };
    dialog.onclick = (event) => event.stopPropagation();
    form.onsubmit = (event) => {
      event.preventDefault();
      close({
        provider: provider.value as Provider, bridgeUrl: bridge.value.trim(),
        bridgeToken: bridgeToken.value.trim(), cwd: cwd.value.trim(),
      });
    };
    provider.focus();
  });
}

async function findResume(path: Path, api: PluginApi): Promise<ResumeInfo | null> {
  let current: Path | null = path;
  while (current && !current.isRoot()) {
    const match = (await api.session.document.getText(current.row)).match(resumePattern);
    if (match) { return {provider: match[1] as Provider, sessionId: match[2]}; }
    current = current.parent;
  }
  return null;
}

function promptText(text: string): string {
  return text.replace(/^Next prompt:\s*/, '').replace(/^Answer:\s*/, '').trim();
}

async function setText(api: PluginApi, path: Path, text: string): Promise<void> {
  if (await api.session.document.isValidPath(path)) {
    await api.session.document.setLine(path.row, text.split(''));
  }
}

registerPlugin({
  name: pluginName,
  author: 'Ivo Sele',
  description: 'Run Codex, Cursor Agent, or Hermes on the current node with resumable, streaming conversations. Keybind: Ctrl/Cmd-Shift-A.',
}, async (api) => {
  api.registerAction('llm-agent-configure', 'Configure the LLM Agent bridge and provider', async ({session}) => {
    const next = await settingsDialog(await getSettings(api));
    if (next) { await api.setData('settings', next); session.showMessage('LLM Agent settings saved', {text_class: 'success'}); }
  });
  api.registerAction('llm-agent-run', 'Run or resume an agent using the current node as the prompt', async ({session}) => {
    const sourcePath = session.cursor.path;
    if (!(await session.document.isValidPath(sourcePath))) { return; }
    const source = promptText(await session.document.getText(sourcePath.row));
    if (!source) { session.showMessage('Enter an agent prompt in this node first', {text_class: 'error'}); return; }
    let settings = await getSettings(api);
    if (!settings.cwd || !settings.bridgeToken) {
      const configured = await settingsDialog(settings);
      if (!configured) { return; }
      settings = configured; await api.setData('settings', settings);
    }
    const resume = await findResume(sourcePath, api);
    const provider = resume ? resume.provider : settings.provider;
    const rows = await session.addBlocks(sourcePath, -1, [{
      text: `Agent status [starting · ${provider}]`,
      children: [{text: 'Agent response', children: ['…']}],
    }]);
    const statusPath = rows[0];
    const responsePath = (await session.document.getChildren(statusPath))[0];
    const responseRows: Array<Path> = [(await session.document.getChildren(responsePath))[0]];
    if (await session.document.collapsed(sourcePath.row)) { await session.document.setCollapsed(sourcePath.row, false); }
    const socket = new WebSocket(settings.bridgeUrl);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let response = '';
    let sessionId = resume ? resume.sessionId : '';
    let lastRender = 0;
    let pendingRender: number | null = null;
    let renderQueue = Promise.resolve();
    const render = () => {
      pendingRender = null; lastRender = Date.now();
      const snapshot = response;
      renderQueue = renderQueue.then(async () => {
        const lines = snapshot.replace(/\r/g, '').split('\n');
        while (responseRows.length < lines.length) {
          const added = await session.addBlocks(responsePath, -1, ['']);
          responseRows.push(added[0]);
        }
        for (let i = 0; i < lines.length; i++) {
          await setText(api, responseRows[i], lines[i] || (i === lines.length - 1 ? '…' : ' '));
        }
      });
    };
    const scheduleRender = () => {
      if (Date.now() - lastRender > 75) {
        render();
      } else if (pendingRender == null) {
        pendingRender = window.setTimeout(render, 75);
      }
    };
    socket.onopen = () => socket.send(JSON.stringify({
      type: 'run', requestId, provider, prompt: source, cwd: settings.cwd, token: settings.bridgeToken,
      resumeId: resume ? resume.sessionId : undefined,
    }));
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.requestId && message.requestId !== requestId) { return; }
      if (message.type === 'text') { response += message.text; scheduleRender(); }
      if (message.type === 'session') { sessionId = message.sessionId; }
      if (message.type === 'status') { await setText(api, statusPath, `Agent status [running · ${provider}] ${message.status}`); }
      if (message.type === 'error') {
        await setText(api, statusPath, `Agent status [error · ${provider}]`);
        await setText(api, responseRows[0], `Agent error: ${message.message}`);
      }
      if (message.type === 'done') {
        if (pendingRender != null) { window.clearTimeout(pendingRender); }
        render();
        await renderQueue;
        if (!response) { await setText(api, responseRows[0], '(no response)'); }
        await setText(api, statusPath, `Agent status [${message.code === 0 ? 'done' : 'error'} · ${provider}]`);
        if (sessionId) {
          await session.addBlocks(statusPath, -1, [{
            text: `Agent resume [${provider}:${sessionId}]`,
            children: ['Next prompt: '],
          }]);
        } else {
          await session.addBlocks(statusPath, -1, [
            message.code === 0 ? 'Next prompt: ' : `Agent error: ${message.error || `exit ${message.code}`}`,
          ]);
        }
        socket.close();
      }
    };
    socket.onerror = async () => {
      await setText(api, statusPath, `Agent status [bridge unavailable · ${provider}]`);
      await setText(api, responseRows[0], `Agent error: cannot connect to ${settings.bridgeUrl}. Run npm run agent-server.`);
    };
  });
  const mappings = {'llm-agent-run': [['ctrl+shift+a'], ['meta+shift+a']]};
  api.registerDefaultMappings('NORMAL', mappings);
  api.registerDefaultMappings('INSERT', mappings);
}, (api) => api.deregisterAll());

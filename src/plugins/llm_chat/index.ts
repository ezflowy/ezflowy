import Path from '../../assets/ts/path';
import { registerPlugin, PluginApi } from '../../assets/ts/plugins';
import { SerializedBlock } from '../../assets/ts/types';
import './index.sass';

const pluginName = 'LLM Chat';
const defaultProviderUrl = 'https://api.openai.com/v1/chat/completions';
const defaultModel = 'gpt-5.4';

type Settings = {
  providerUrl: string;
  model: string;
  apiKey: string;
};

type OutlineNode = {
  text: string;
  children: Array<OutlineNode>;
};

function getIndent(depth: number): string {
  let prefix = new Array(depth).join('    ');
  return depth == 0 ? prefix : prefix + '* ';
}

function cleanLine(text: string): string {
  //return text;
  let cleaned = text.trim();
  while (true) {
    const next = cleaned
      .replace(/^[-*+•◦▪‣·]\s+/, '')
      .replace(/^\d+[\.)]\s+/, '')
      .replace(/^\[[ xX]\]\s+/, '')
      .trimStart();
    if (next === cleaned) {
      break;
    }
    cleaned = next;
  }
  return cleaned.trim();
}

function startsWithBulletMarker(text: string): boolean {
  return /^\s*\*+\s+[-*+•◦▪‣·]\s+/.test(text);
}

function parseOutlineReply(reply: string): Array<SerializedBlock> {
  const roots: Array<OutlineNode> = [];
  const stack: Array<{ level: number, node: OutlineNode }> = [];

  reply.replace(/\r/g, '').split('\n').forEach((line) => {
    if (!line.trim()) {
      return;
    }

    const spaces = (line.match(/^\s*/) || [''])[0]
      .replace(/\t/g, '  ')
      .length;
    let level = Math.floor(spaces / 4);
    if (startsWithBulletMarker(line)) {
      level += 1;
    }

    const text = cleanLine(line);
    if (!text) {
      return;
    }

    const node: OutlineNode = { text, children: [] };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (!stack.length) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ level, node });
  });

  if (!roots.length) {
    return [cleanLine(reply) || '(no response)'];
  }

  const toSerialized = (node: OutlineNode): SerializedBlock => {
    if (!node.children.length) {
      return node.text;
    }
    return {
      text: node.text,
      children: node.children.map(toSerialized),
    };
  };

  return roots.map(toSerialized);
}

function blockText(block: SerializedBlock): string {
  if (typeof block === 'string') {
    return block;
  }
  if ('clone' in block) {
    return '';
  }
  return block.text;
}

function blockChildren(block: SerializedBlock): Array<SerializedBlock> {
  if (typeof block === 'string' || ('clone' in block)) {
    return [];
  }
  return block.children || [];
}

function normalizeForMatch(text: string): string {
  return cleanLine(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function buildOutlineText(path: Path, api: PluginApi): Promise<string> {
  const visited: { [row: number]: boolean } = {};
  const lines: Array<string> = [];

  async function walk(curPath: Path, depth: number) {
    const row = curPath.row;
    if (visited[row]) {
      lines.push(`${getIndent(depth)}[clone omitted]`);
      return;
    }
    visited[row] = true;

    const text = (await api.session.document.getText(row)).trim();
    lines.push(`${getIndent(depth)}${text}`);

    const children = await api.session.document.getChildren(curPath);
    for (let i = 0; i < children.length; i++) {
      await walk(children[i], depth + 1);
    }
  }

  await walk(path, 0);
  return lines.join('\n');
}

async function getSettings(api: PluginApi): Promise<Settings> {
  const settings = await api.getData('settings', {
    providerUrl: defaultProviderUrl,
    model: defaultModel,
    apiKey: '',
  });
  return {
    providerUrl: settings.providerUrl || defaultProviderUrl,
    model: settings.model || defaultModel,
    apiKey: settings.apiKey || '',
  };
}

async function setSettings(api: PluginApi, settings: Settings): Promise<void> {
  await api.setData('settings', settings);
}

function appendSettingField(
  form: HTMLFormElement,
  labelText: string,
  input: HTMLInputElement,
  helpText?: string,
): void {
  const field = document.createElement('label');
  field.className = 'llm-settings-dialog__field';

  const label = document.createElement('span');
  label.className = 'llm-settings-dialog__label';
  label.textContent = labelText;
  field.appendChild(label);
  field.appendChild(input);

  if (helpText) {
    const help = document.createElement('span');
    help.className = 'llm-settings-dialog__help';
    help.textContent = helpText;
    field.appendChild(help);
  }

  form.appendChild(field);
}

function getModelsUrl(providerUrl: string): string {
  const url = new URL(providerUrl);
  const path = url.pathname.replace(/\/$/, '');

  if (/\/api\/(chat|generate)$/i.test(path)) {
    url.pathname = path.replace(/\/api\/(chat|generate)$/i, '/api/tags');
  } else if (/\/(chat\/completions|completions|responses)$/i.test(path)) {
    url.pathname = path.replace(/\/(chat\/completions|completions|responses)$/i, '/models');
  } else if (!/\/models$/i.test(path) && !/\/api\/tags$/i.test(path)) {
    url.pathname = `${path}/models`;
  }

  url.search = '';
  url.hash = '';
  return url.toString();
}

function getModelNames(payload: any): Array<string> {
  const entries = Array.isArray(payload && payload.data) ? payload.data :
    (Array.isArray(payload && payload.models) ? payload.models : []);
  const names = entries.map((entry: any) => {
    if (typeof entry === 'string') {
      return entry;
    }
    return entry && (entry.id || entry.name || entry.model);
  }).filter((name: any): name is string => typeof name === 'string' && Boolean(name.trim()));

  return Array.from(new Set<string>(names)).sort((left, right) => left.localeCompare(right));
}

function showSettingsDialog(settings: Settings): Promise<Settings | null> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div');
    overlay.className = 'llm-settings-dialog__overlay';
    overlay.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'llm-settings-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'llm-settings-dialog-title');

    const title = document.createElement('h2');
    title.id = 'llm-settings-dialog-title';
    title.textContent = 'Configure LLM provider';
    dialog.appendChild(title);

    const form = document.createElement('form');

    const providerUrlInput = document.createElement('input');
    providerUrlInput.type = 'url';
    providerUrlInput.value = settings.providerUrl;
    providerUrlInput.setAttribute('autocomplete', 'url');
    appendSettingField(form, 'LLM provider URL', providerUrlInput, 'Chat completions endpoint');

    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.value = settings.model;
    modelInput.autocomplete = 'off';
    modelInput.setAttribute('role', 'combobox');
    modelInput.setAttribute('aria-autocomplete', 'list');
    modelInput.setAttribute('aria-expanded', 'false');
    appendSettingField(form, 'Model name', modelInput, 'Click to retrieve models from the provider');

    const modelField = modelInput.parentElement as HTMLLabelElement;
    modelField.classList.add('llm-settings-dialog__model-field');
    const modelList = document.createElement('div');
    modelList.className = 'llm-settings-dialog__model-list';
    modelList.setAttribute('role', 'listbox');
    modelList.hidden = true;
    modelField.insertBefore(modelList, modelInput.nextSibling);

    const apiKeyInput = document.createElement('input');
    apiKeyInput.type = 'password';
    apiKeyInput.autocomplete = 'off';
    apiKeyInput.placeholder = settings.apiKey ? 'Current API key is set' : 'Optional';
    appendSettingField(form, 'API key', apiKeyInput, 'Leave blank to keep the current key');

    const hideModelList = (): void => {
      modelList.hidden = true;
      modelInput.setAttribute('aria-expanded', 'false');
    };
    const showModelMessage = (message: string, isError = false): void => {
      modelList.replaceChildren();
      const status = document.createElement('div');
      status.className = 'llm-settings-dialog__model-status';
      if (isError) {
        status.classList.add('llm-settings-dialog__model-status--error');
      }
      status.textContent = message;
      modelList.appendChild(status);
      modelList.hidden = false;
      modelInput.setAttribute('aria-expanded', 'true');
    };
    const loadModels = async (): Promise<void> => {
      showModelMessage('Loading models...');
      try {
        const headers: { [key: string]: string } = {};
        const apiKey = apiKeyInput.value.trim() || settings.apiKey;
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        const response = await fetch(getModelsUrl(providerUrlInput.value.trim() || defaultProviderUrl), {
          headers,
        });
        const payload = await response.json();
        if (!response.ok) {
          const errText = payload && payload.error && (payload.error.message || payload.error);
          throw new Error(errText || response.statusText || 'Request failed');
        }

        const models = getModelNames(payload);
        if (!models.length) {
          throw new Error('Provider returned no models');
        }

        modelList.replaceChildren();
        models.forEach((model) => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'llm-settings-dialog__model-option';
          option.setAttribute('role', 'option');
          option.textContent = model;
          option.addEventListener('click', () => {
            modelInput.value = model;
            hideModelList();
            modelInput.focus();
          });
          modelList.appendChild(option);
        });
      } catch (error) {
        const message = (error as Error).message || 'Could not retrieve models';
        showModelMessage(`Could not retrieve models: ${message}`, true);
      }
    };
    modelInput.addEventListener('click', () => {
      loadModels();
    });

    const actions = document.createElement('div');
    actions.className = 'llm-settings-dialog__actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    actions.appendChild(cancelButton);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'llm-settings-dialog__save';
    saveButton.textContent = 'Save';
    actions.appendChild(saveButton);
    form.appendChild(actions);
    dialog.appendChild(form);
    overlay.appendChild(dialog);

    const close = (result: Settings | null): void => {
      overlay.remove();
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      resolve(result);
    };

    cancelButton.addEventListener('click', () => close(null));
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) {
        close(null);
      } else if (!modelField.contains(event.target as Node)) {
        hideModelList();
      }
    });
    overlay.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      close({
        providerUrl: providerUrlInput.value.trim() || defaultProviderUrl,
        model: modelInput.value.trim() || defaultModel,
        apiKey: apiKeyInput.value.trim() || settings.apiKey,
      });
    });

    document.body.appendChild(overlay);
    providerUrlInput.focus();
    providerUrlInput.select();
  });
}

async function configureSettings(api: PluginApi): Promise<boolean> {
  const settings = await getSettings(api);
  const enteredSettings = await showSettingsDialog(settings);
  if (!enteredSettings) {
    return false;
  }
  await setSettings(api, enteredSettings);
  return true;
}

registerPlugin({
  name: pluginName,
  author: 'Ivo Sele',
  description: `Send current bullet + descendants to Chat Completions and append ` +
    `reply below. Defaults: ${defaultProviderUrl} / ${defaultModel}. ` +
    `Keybind: ctrl+shift+enter.`,
}, async function(api) {
  api.registerAction(
    'llm-chat-configure',
    'Configure LLM provider URL, model, and token',
    async function({ session }) {
      const changed = await configureSettings(api);
      if (!changed) {
        session.showMessage('LLM configuration cancelled', { text_class: 'error' });
        return;
      }
      const settings = await getSettings(api);
      const apiKeyStatus = settings.apiKey ? 'set' : 'missing';
      session.showMessage(
        `LLM config saved (${settings.providerUrl}, model ${settings.model}, apiKey ${apiKeyStatus})`,
        { text_class: 'success' }
      );
    },
  );

  api.registerAction(
    'llm-chat-send-current-subtree',
    'Send current line and descendants to ChatGPT and append response under current line',
    async function({ session }) {
      const promptPath = session.cursor.path;

      if (!(await session.document.isValidPath(promptPath))) {
        session.showMessage('Cannot send: cursor path is no longer valid', { text_class: 'error' });
        return;
      }

      const configured = await configureSettings(api);
      if (!configured) {
        session.showMessage('LLM send cancelled (configuration cancelled)', { text_class: 'error' });
        return;
      }

      const settings = await getSettings(api);
      const outline = await buildOutlineText(promptPath, api);

      session.showMessage(`Sending to ChatGPT (${settings.model})...`, { time: 0 });

      let replyText: string;
      try {
        const headers: { [key: string]: string } = {
          'Content-Type': 'application/json',
        };
        if (settings.apiKey) {
          headers.Authorization = `Bearer ${settings.apiKey}`;
        }

        const response = await fetch(settings.providerUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: settings.model,
            messages: [{
              role: 'user',
              content:
                'Help with this outline. ' +

                'Formatting instructions:' +
                "Don't include the first line of the outline text in the response, unless it changed." +
                'Return everything in raw markdown. ' +
                'Convert anything which looks like a bullet into markdown list format. ' +
                'Convert enumerations into bullets. ' +
                'Use 4 spaces for indentation. ' +
                'Do not use any markdown header syntax.' +
                'Preserve all URLs exactly as-is.\\n\\n' +

                'Features:' +
                'Remove lines which are empty or only contain dashes. ' +
                'Join sentences which are split across lines. ' +
                'Within text blocks, split sentences into separate lines and indent one level under the first sentence of the block. ' +
                `\\n\\n${outline}`,
            },],
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          const errText = (payload && payload.error && payload.error.message) || response.statusText;
          throw new Error(errText || 'Request failed');
        }

        const choice = payload && payload.choices && payload.choices[0];
        const message = choice && choice.message;
        replyText = (message && message.content || '').trim();
        if (!replyText) {
          throw new Error('Empty response from model');
        }
      } catch (error) {
        const message = (error as Error).message || 'LLM request failed';
        session.showMessage(`LLM error: ${message}`, { text_class: 'error' });
        return;
      }

      let replyBlocks = parseOutlineReply(replyText);
      const currentText = await session.document.getText(promptPath.row);
      if (replyBlocks.length > 0 &&
          normalizeForMatch(blockText(replyBlocks[0])) === normalizeForMatch(currentText)) {
        replyBlocks = [
          ...blockChildren(replyBlocks[0]),
          ...replyBlocks.slice(1),
        ];
      }
      if (replyBlocks.length === 0) {
        session.showMessage('LLM reply contained no new bullets to add', { text_class: 'error' });
        return;
      }
      const existingChildren = await session.document.getChildren(promptPath);
      if (existingChildren.length > 0) {
        await session.delBlocks(promptPath.row, 0, existingChildren.length);
      }
      await session.addBlocks(promptPath, 0, replyBlocks);
      if (await session.document.collapsed(promptPath.row)) {
        await session.document.setCollapsed(promptPath.row, false);
      }
      session.showMessage('LLM reply inserted below current bullet', { text_class: 'success' });
    },
  );

  api.registerDefaultMappings('NORMAL', {
    'llm-chat-send-current-subtree': [
      ['ctrl+shift+enter'],
      ['meta+shift+enter'],
    ],
  });

  api.registerDefaultMappings('INSERT', {
    'llm-chat-send-current-subtree': [
      ['ctrl+shift+enter'],
      ['meta+shift+enter'],
    ],
  });
}, (api => api.deregisterAll()));

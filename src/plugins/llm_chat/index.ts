import Path from '../../assets/ts/path';
import { registerPlugin, PluginApi } from '../../assets/ts/plugins';
import { SerializedBlock } from '../../assets/ts/types';

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
  return new Array(depth + 1).join('  ');
}

function cleanLine(text: string): string {
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
    const level = Math.floor(spaces / 2);

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
      lines.push(`${getIndent(depth)}- [clone omitted]`);
      return;
    }
    visited[row] = true;

    const text = (await api.session.document.getText(row)).trim();
    lines.push(`${getIndent(depth)}- ${text}`);

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

async function configureSettings(api: PluginApi): Promise<boolean> {
  const settings = await getSettings(api);
  const enteredProviderUrl = window.prompt(
    'LLM provider URL (chat completions endpoint):',
    settings.providerUrl
  );
  if (enteredProviderUrl === null) {
    return false;
  }
  const providerUrl = enteredProviderUrl.trim() || defaultProviderUrl;

  const enteredModel = window.prompt('Model name:', settings.model);
  if (enteredModel === null) {
    return false;
  }
  const model = enteredModel.trim() || defaultModel;

  const enteredApiKey = window.prompt(
    'API key (leave blank to keep current key):',
    ''
  );
  if (enteredApiKey === null) {
    return false;
  }
  const apiKey = enteredApiKey.trim() || settings.apiKey;

  await setSettings(api, {
    apiKey,
    providerUrl,
    model,
  });
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
            messages: [
              {
                role: 'user',
                content:
                    'Continue/help with this outline. Treat the first bullet as current ' +
                    'focus and include helpful next bullets.'+
                    `\\n\\n${outline}`,
              },
            ],
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
      await session.addBlocks(promptPath, existingChildren.length, replyBlocks);
      if (await session.document.collapsed(promptPath.row)) {
        await session.document.setCollapsed(promptPath.row, false);
      }
      session.showMessage('LLM reply added below current bullet', { text_class: 'success' });
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

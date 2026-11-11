import * as http from 'http';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { randomBytes, timingSafeEqual } from 'crypto';
import * as WebSocket from 'ws';

type Provider = 'codex' | 'cursor' | 'hermes';
type RunMessage = {
  type: 'run',
  requestId: string,
  provider: Provider,
  prompt: string,
  cwd: string,
  resumeId?: string,
  token?: string,
};

const port = Number(process.env.EZFLOWY_AGENT_PORT || 7331);
const host = process.env.EZFLOWY_AGENT_HOST || '127.0.0.1';
const token = process.env.EZFLOWY_AGENT_TOKEN || randomBytes(24).toString('base64url');
const server = http.createServer((_request, response) => {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end('ezflowy LLM Agent bridge\n');
});
const wss = new WebSocket.Server({server});

function commandFor(message: RunMessage): {command: string, args: Array<string>} {
  if (message.provider === 'codex') {
    if (message.resumeId) {
      return {command: 'codex', args: ['exec', 'resume', '--json', message.resumeId, '-']};
    }
    return {command: 'codex', args: ['exec', '--json', '-C', message.cwd, '-']};
  }
  if (message.provider === 'cursor') {
    const args = ['-p', '--output-format', 'stream-json'];
    if (message.resumeId) {
      args.push('--resume', message.resumeId);
    }
    args.push(message.prompt);
    return {command: 'cursor-agent', args};
  }
  const args = message.resumeId ? ['--resume', message.resumeId] : [];
  args.push('chat', '-q', message.prompt, '--format', 'stream-json');
  return {command: 'hermes', args};
}

function textFromEvent(provider: Provider, event: any): string {
  if (provider === 'hermes' && event.type === 'text') {
    return event.text || '';
  }
  if (provider === 'cursor' && event.type === 'assistant') {
    const content = event.message && event.message.content;
    if (Array.isArray(content)) {
      return content.filter((part: any) => part.type === 'text').map((part: any) => part.text || '').join('');
    }
  }
  if (provider === 'codex' && event.type === 'item.completed' && event.item && event.item.type === 'agent_message') {
    return event.item.text || '';
  }
  return '';
}

function progressFromEvent(event: any): string {
  if (event.type === 'tool_use') {
    return `Using ${event.name || 'tool'}`;
  }
  if (event.type === 'tool_result') {
    return `${event.name || 'Tool'} finished`;
  }
  if (event.type === 'item.started' && event.item) {
    return event.item.type === 'command_execution' ? 'Running command' : '';
  }
  if (event.type === 'item.completed' && event.item && event.item.type === 'command_execution') {
    return `Command finished (${event.item.exit_code})`;
  }
  return '';
}

function sessionFromEvent(event: any): string {
  return event.session_id || event.thread_id ||
    (event.type === 'thread.started' ? event.thread_id : '') || '';
}

wss.on('connection', (socket) => {
  let child: ChildProcessWithoutNullStreams | null = null;
  const send = (payload: object) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };
  socket.on('message', (raw) => {
    let message: RunMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch (_error) {
      send({type: 'error', message: 'Invalid JSON request'});
      return;
    }
    if (message.type !== 'run' || !['codex', 'cursor', 'hermes'].includes(message.provider)) {
      send({type: 'error', requestId: message.requestId, message: 'Unsupported agent request'});
      return;
    }
    const supplied = Buffer.from(message.token || '');
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      send({type: 'error', requestId: message.requestId, message: 'Agent bridge token rejected'});
      socket.close();
      return;
    }
    if (child) {
      send({type: 'error', requestId: message.requestId, message: 'This connection is already running an agent'});
      return;
    }
    const invocation = commandFor(message);
    send({type: 'status', requestId: message.requestId, status: 'starting'});
    child = spawn(invocation.command, invocation.args, {
      cwd: message.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (message.provider === 'codex') {
      child.stdin.end(message.prompt);
    } else {
      child.stdin.end();
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split('\n');
      stdout = lines.pop() || '';
      lines.forEach((line) => {
        if (!line.trim()) { return; }
        try {
          const event = JSON.parse(line);
          const sessionId = sessionFromEvent(event);
          if (sessionId) { send({type: 'session', requestId: message.requestId, sessionId}); }
          const text = textFromEvent(message.provider, event);
          if (text) { send({type: 'text', requestId: message.requestId, text}); }
          const progress = progressFromEvent(event);
          if (progress) { send({type: 'status', requestId: message.requestId, status: progress}); }
          send({type: 'raw', requestId: message.requestId, event});
        } catch (_error) {
          send({type: 'text', requestId: message.requestId, text: `${line}\n`});
        }
      });
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      send({type: 'error', requestId: message.requestId, message: error.message});
    });
    child.on('close', (code) => {
      const match = stderr.match(/session_id:\s*([^\s]+)/i);
      if (match) { send({type: 'session', requestId: message.requestId, sessionId: match[1]}); }
      if (stdout.trim()) { send({type: 'text', requestId: message.requestId, text: stdout}); }
      send({
        type: 'done', requestId: message.requestId, code: code == null ? 1 : code,
        error: code === 0 ? '' : stderr.trim(),
      });
      child = null;
    });
  });
  socket.on('close', () => {
    if (child) { child.kill('SIGTERM'); }
  });
});

server.listen(port, host, () => {
  process.stdout.write(`LLM Agent bridge listening on ws://${host}:${port}\n`);
  process.stdout.write(`LLM Agent bridge token: ${token}\n`);
});

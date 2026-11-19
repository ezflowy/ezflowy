import { strict as assert } from 'assert';
import { agentResponseLines, filterAgentText, AgentTextState } from '../../src/shared/agent_output';
import { DocumentStore } from '../../src/assets/ts/datastore';
import Document from '../../src/assets/ts/document';
import Path from '../../src/assets/ts/path';
import { InMemory } from '../../src/shared/data_backend';
import { agentCompletion, buildAgentPrompt, llmAgentMappings } from '../../src/plugins/llm_agent';
import { commandFor, stripLeadingBlankLines } from '../../server/agent_server';

describe('LLM Agent plugin', function() {
  it('includes descendants when only the selected node is an Agent resume node', async function() {
    const document = new Document(new DocumentStore(new InMemory()));
    await document.load([{text: 'Agent resume [hermes:saved-session]', children: [
      {text: 'Next prompt: Continue', children: ['More details']},
    ]}]);
    const path = (await document.getChildren(Path.root()))[0];
    const prompt = await buildAgentPrompt(path, document);
    if (prompt !== 'Agent resume [hermes:saved-session]\n- Next prompt: Continue\n  - More details') {
      throw new Error(`Unexpected resume subtree prompt: ${prompt}`);
    }
  });

  it('includes descendants in follow-up prompts unless any descendant is an Agent resume node', async function() {
    const document = new Document(new DocumentStore(new InMemory()));
    await document.load([{text: 'Next prompt: Do this', children: [
      {text: 'Details', children: ['Nested detail']}, 'Other detail',
    ]}]);
    const path = (await document.getChildren(Path.root()))[0];
    await document.setCollapsed(path.row, true);
    const prompt = await buildAgentPrompt(path, document);
    if (prompt !== 'Do this\n- Details\n  - Nested detail\n- Other detail') {
      throw new Error(`Unexpected subtree prompt: ${prompt}`);
    }
    const details = (await document.getChildren(path))[0];
    const nested = (await document.getChildren(details))[0];
    await document.setLine(nested.row, 'Agent resume [hermes:saved-session]'.split(''));
    const resumedPrompt = await buildAgentPrompt(path, document);
    if (resumedPrompt !== 'Do this') {
      throw new Error(`Expected only the selected node: ${resumedPrompt}`);
    }
  });

  it('uses the normalized key tokens for shifted letter shortcuts', function() {
    const expected = [
      ['ctrl+A'],
      ['meta+A'],
    ];
    if (JSON.stringify(llmAgentMappings['llm-agent-run']) !== JSON.stringify(expected)) {
      throw new Error('Unexpected LLM Agent shortcut mappings');
    }
  });

  it('shows an agent failure instead of offering a resume', function() {
    const completion = agentCompletion('', 1, 'Hermes failed');
    if (completion.response !== 'Agent error: Hermes failed') {
      throw new Error(`Unexpected failure response: ${completion.response}`);
    }
    if (completion.canResume) {
      throw new Error('Failed agent runs must not offer a resume');
    }
    if (completion.followUp !== 'Agent error: Hermes failed') {
      throw new Error(`Unexpected failure follow-up: ${completion.followUp}`);
    }
  });

  it('preserves partial output and appends the agent failure', function() {
    const completion = agentCompletion('Partial response\n', 2, 'provider disconnected');
    const expected = 'Partial response\n\nAgent error: provider disconnected';
    if (completion.response !== expected) {
      throw new Error(`Unexpected partial failure response: ${completion.response}`);
    }
  });

  it('keeps successful sessions resumable', function() {
    const completion = agentCompletion('', 0, 'ignored stderr');
    if (completion.response !== '(no response)' || !completion.canResume || completion.followUp !== 'Next prompt: ') {
      throw new Error('Successful completion behavior changed');
    }
  });

  it('drops only the leading blank lines an agent streams before its reply', function() {
    const state = {started: false};
    if (stripLeadingBlankLines('\n\n', state) !== '') {
      throw new Error('Leading blank lines were not stripped');
    }
    if (stripLeadingBlankLines('Hello\n\nWorld', state) !== 'Hello\n\nWorld') {
      throw new Error('Interior blank lines must stay');
    }
    if (stripLeadingBlankLines('Second paragraph', state) !== 'Second paragraph') {
      throw new Error('Only the leading blank lines of a run may be stripped');
    }
    const fresh = {started: false};
    if (stripLeadingBlankLines('No leading blanks', fresh) !== 'No leading blanks') {
      throw new Error('Clean first text was modified');
    }
  });

  it('keeps leading stripping active through metadata and split blank chunks', function() {
    const state = {started: false};
    for (const text of ['', '\n', ' \t', '\r\n', '']) {
      assert.equal(stripLeadingBlankLines(text, state), '');
      assert.equal(state.started, false);
    }
    assert.equal(stripLeadingBlankLines('Hello', state), 'Hello');
    assert.equal(state.started, true);
  });

  it('filters blank lines independently of stream chunk boundaries', function() {
    const input = '\r\n \t\r\n  Hello\r\n\r\n \t\n    World\n\n';
    const expected = '  Hello\n    World';
    for (let split = 0; split <= input.length; split++) {
      const state: AgentTextState = {started: false, lineStarted: false, pending: ''};
      const chunks = ['', input.slice(0, split), '', input.slice(split), ''];
      assert.equal(chunks.map(chunk => filterAgentText(chunk, state)).join(''), expected);
    }
    const state: AgentTextState = {started: false, lineStarted: false, pending: ''};
    assert.equal(input.split('').map(char => filterAgentText(char, state)).join(''), expected);
    assert.equal(filterAgentText('Fresh run', {started: false, lineStarted: false, pending: ''}), 'Fresh run');
  });

  it('renders only nonblank outline rows while preserving content indentation', function() {
    assert.deepEqual(agentResponseLines('\n \t\r\nHello\n\n  World\n'), ['Hello', '  World']);
    assert.deepEqual(agentResponseLines('\n \t\r\n'), []);
    assert.deepEqual(agentResponseLines('Partial response\n\nAgent error: failed'),
      ['Partial response', 'Agent error: failed']);
  });

  it('runs fresh and resumed Codex sessions without sandbox or approval prompts', function() {
    const fresh = commandFor({
      type: 'run', requestId: 'r1', provider: 'codex', prompt: 'do it', cwd: '/tmp/repo', token: 't',
    });
    assert.equal(fresh.command, 'codex');
    assert.deepEqual(fresh.args, [
      'exec', '--dangerously-bypass-approvals-and-sandbox', '--json', '-C', '/tmp/repo', '-',
    ]);
    const resume = commandFor({
      type: 'run', requestId: 'r2', provider: 'codex', prompt: 'again', cwd: '/tmp/repo',
      resumeId: 'session-123', token: 't',
    });
    assert.equal(resume.command, 'codex');
    assert.deepEqual(resume.args, [
      'exec', '--dangerously-bypass-approvals-and-sandbox', 'resume', '--json', 'session-123', '-',
    ]);
  });
});

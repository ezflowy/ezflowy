import { DocumentStore } from '../../src/assets/ts/datastore';
import Document from '../../src/assets/ts/document';
import Path from '../../src/assets/ts/path';
import { InMemory } from '../../src/shared/data_backend';
import { agentCompletion, buildAgentPrompt, llmAgentMappings } from '../../src/plugins/llm_agent';

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
});

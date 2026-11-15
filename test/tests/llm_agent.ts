import { agentCompletion, llmAgentMappings } from '../../src/plugins/llm_agent';

describe('LLM Agent plugin', function() {
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

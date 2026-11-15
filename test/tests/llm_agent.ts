import { llmAgentMappings } from '../../src/plugins/llm_agent';

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
});

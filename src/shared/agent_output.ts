export type AgentTextState = {started: boolean, lineStarted: boolean, pending: string};

// Hold separators and indentation until a nonblank line arrives, even across chunks.
export function filterAgentText(text: string, state: AgentTextState): string {
  let output = '';
  for (const char of text) {
    if (char === '\r') { continue; }
    if (char === '\n') {
      state.lineStarted = false;
      state.pending = state.started ? '\n' : '';
    } else if (!state.lineStarted && /\s/.test(char)) {
      state.pending += char;
    } else {
      output += state.pending + char;
      state.pending = '';
      state.started = true;
      state.lineStarted = true;
    }
  }
  return output;
}

export function agentResponseLines(text: string): Array<string> {
  return text.replace(/\r/g, '').split('\n').filter(line => line.trim().length > 0);
}

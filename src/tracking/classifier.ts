export interface ClassificationResult {
  think: number;
  chat: number;
  code: number;
}

export function classify(msg: {
  tokens: { output: number; reasoning: number };
  toolCallCount: number;
}): ClassificationResult {
  const think = msg.tokens.reasoning;

  if (msg.toolCallCount > 0) {
    return {
      think,
      chat: 0,
      code: msg.tokens.output,
    };
  }

  return {
    think,
    chat: msg.tokens.output,
    code: 0,
  };
}

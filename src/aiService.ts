
type OllamaResponse = {
  response?: string;
  thinking?: string;
  done?: boolean;
  done_reason?: string;
  error?: string;
};

export async function askAI(question: string): Promise<string> {
  const prompt = `You are a helpful, concise Moodle support assistant.

Answer the user's question directly using clear, simple language.
Return only the final answer.
Do not include internal reasoning, planning, or thinking tags.
If you do not know something, say so honestly.

User question: ${question}`;

  const response = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen3:4b",
      prompt,
      stream: false,
      think: false,
      options: {
        num_predict: 256,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  const data: OllamaResponse = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  const rawAnswer = data.response ?? "";

  // If Qwen includes a thinking section, keep only the text after it.
  const closingTag = rawAnswer.lastIndexOf("</think>");
  const finalText =
    closingTag >= 0
      ? rawAnswer.slice(closingTag + "</think>".length)
      : rawAnswer;

  const answer = finalText
    .replace(/<\/?think>/g, "")
    .trim();

  if (!answer) {
    throw new Error(
      `Ollama returned an empty answer. Completion reason: ${
        data.done_reason ?? "unknown"
      }`
    );
  }

  return answer;
}

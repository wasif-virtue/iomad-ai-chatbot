
import { searchKnowledge } from "./knowledgeService.js";

type OllamaChatMessage = {
  role?: string;
  content?: string;
  thinking?: string;
};

type OllamaChatResponse = {
  message?: OllamaChatMessage;
  done?: boolean;
  done_reason?: string;
  error?: string;
};

export type AIAnswer = {
  answer: string;
  sources: string[];
  usedKnowledge: boolean;
};

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = "qwen3:4b";

function buildPrompt(
  question: string,
  context: string,
): string {
  return `Answer the question with one concise sentence using only these reference facts. Related facts may be combined even if their wording differs. Do not show reasoning.

KNOWLEDGE PASSAGES:
${context}

Question:
${question}`;
}

async function prepareQuestion(question: string): Promise<{
  prompt: string;
  sources: string[];
  usedKnowledge: boolean;
}> {
  const results = await searchKnowledge(question);

  const sources = [
    ...new Set(results.map((item) => item.source)),
  ];

  const context =
    results.length > 0
      ? results
          .map(
            (item, index) =>
              `[Source ${index + 1}: ${item.source}]\n${item.content}`,
          )
          .join("\n\n")
      : "No relevant passages were found in the local knowledge base.";

  return {
    prompt: buildPrompt(question, context),
    sources,
    usedKnowledge: results.length > 0,
  };
}

function getAnswer(data: OllamaChatResponse): string {
  // Intentionally use only message.content.
  // Never expose message.thinking to the user.
  return data.message?.content?.trim() ?? "";
}

export async function askAI(
  question: string,
): Promise<AIAnswer> {
  const prepared = await prepareQuestion(question);

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "user",
          content: prepared.prompt,
        },
      ],
      stream: false,
      think: "low",
      options: {
        num_predict: 512,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama returned HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const data: OllamaChatResponse = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  const answer = getAnswer(data);

  if (!answer) {
    throw new Error(
      `Ollama returned an empty answer. Completion reason: ${
        data.done_reason ?? "unknown"
      }`,
    );
  }

  return {
    answer,
    // Retrieval is not evidence attribution; do not expose these documents as citations.
    sources: [],
    usedKnowledge: prepared.usedKnowledge,
  };
}

export async function streamAI(
  question: string,
  onToken: (token: string) => void,
): Promise<{ sources: string[]; usedKnowledge: boolean }> {
  const prepared = await prepareQuestion(question);

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "user",
          content: prepared.prompt,
        },
      ],
      stream: true,
      think: "low",
      options: {
        num_predict: 512,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama returned HTTP ${response.status}: ${await response.text()}`,
    );
  }

  if (!response.body) {
    throw new Error("Ollama returned no response stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let visibleOutput = "";
  let finished = false;

  function processLine(line: string): void {
    if (!line.trim()) return;

    let data: OllamaChatResponse;

    try {
      data = JSON.parse(line) as OllamaChatResponse;
    } catch {
      throw new Error("Received invalid JSON from the Ollama stream.");
    }

    if (data.error) {
      throw new Error(data.error);
    }

    // Ollama sends reasoning in message.thinking.
    // Deliberately ignore it and emit only final-answer content.
    
const token = data.message?.content ?? "";

if (token) {
  visibleOutput += token;
  onToken(token);
}

if (data.done) {
  console.log("[Stream diagnostic]", {
    done: data.done,
    doneReason: data.done_reason,
    answerCharacters: visibleOutput.length,
    finalChunkContentLength: token.length,
    hasThinkingField: Boolean(data.message?.thinking),
  });

  finished = true;
}

  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processLine(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (!finished) {
    throw new Error(
      "Ollama stream ended before generation completed.",
    );
  }

  if (!visibleOutput.trim()) {
    throw new Error("Ollama returned no final answer content.");
  }

  return {
    // Retrieval is not evidence attribution; do not expose these documents as citations.
    sources: [],
    usedKnowledge: prepared.usedKnowledge,
  };
}

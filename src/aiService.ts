
type OllamaResponse = {
  response: string;
};

export async function askAI(
  prompt: string
): Promise<string> {
  const response = await fetch(
    "http://localhost:11434/api/generate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3:4b",
        prompt,
        stream: false,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama returned HTTP ${response.status}`
    );
  }

  const data: OllamaResponse = await response.json();

  return data.response;
}

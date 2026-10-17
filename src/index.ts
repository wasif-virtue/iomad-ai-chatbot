
async function main(): Promise<void> {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3:4b",
        prompt: "Explain what Moodle is in one short paragraph.",
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const data: { response: string } = await response.json();

    console.log("\nAI response:\n");
    console.log(data.response);
  } catch (error) {
    console.error("Could not get a response from Ollama.");

    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

main();

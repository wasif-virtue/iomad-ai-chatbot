
import { askAI } from "./aiService.js";

async function main(): Promise<void> {
  try {
    const question =
      "What is Moodle and how does it work?";

    const answer = await askAI(question);

    console.log("\nQuestion:", question);
    console.log("\nAI answer:\n", answer);
  } catch (error) {
    console.error("Could not get a response from Ollama.");

    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

main();

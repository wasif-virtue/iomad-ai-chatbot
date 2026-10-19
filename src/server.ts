import express, { type Request, type Response } from "express";
import { askAI } from "./aiService.js";
const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.post("/api/chat", async (req: Request, res: Response) => {
  const { question } = req.body as { question?: unknown };

  if (
    typeof question !== "string" ||
    question.trim().length === 0
  ) {
    res.status(400).json({
      error: "Please provide a question as a non-empty string.",
    });
    return;
  }

  if (question.length > 2000) {
    res.status(400).json({
      error: "Question must be 2000 characters or fewer.",
    });
    return;
  }

  try {
   const result = await askAI(question.trim());

res.json({
  answer: result.answer,
  sources: result.sources,
  usedKnowledge: result.usedKnowledge,
});
  } catch (error) {
    console.error("Chat request failed:", error);

    res.status(502).json({
      error: "The AI service could not generate a response.",
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Chatbot API running at http://127.0.0.1:${PORT}`);
});
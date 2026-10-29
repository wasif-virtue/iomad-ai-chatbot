
import express, { type Request, type Response } from "express";
import { streamAI } from "./aiService.js";

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

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: object) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  try {
    const metadata = await streamAI(question.trim(), (token) => {
      sendEvent({ type: "token", token });
    });

    sendEvent({
      type: "done",
      sources: metadata.sources,
      usedKnowledge: metadata.usedKnowledge,
    });

    res.end();
  } catch (error) {
    console.error("Chat streaming failed:", error);

    sendEvent({
      type: "error",
      error: "The AI service could not generate a response.",
    });

    res.end();
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Chatbot API running at http://127.0.0.1:${PORT}`);
});

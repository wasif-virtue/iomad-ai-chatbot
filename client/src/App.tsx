
import { useState, type FormEvent } from "react";
import "./App.css";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  usedKnowledge?: boolean;
};

type StreamEvent =
  | { type: "token"; token: string }
  | { type: "done"; sources: string[]; usedKnowledge: boolean }
  | { type: "error"; error: string };

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || loading) return;

    setMessages((previous) => [
      ...previous,
      { role: "user", content: trimmedQuestion },
      { role: "assistant", content: "", sources: [], usedKnowledge: false },
    ]);
    setQuestion("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "The request failed.");
      }

      if (!response.body) {
        throw new Error("The server returned no response stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedDone = false;
      let receivedToken = false;

      const updateAssistant = (update: (message: Message) => Message) => {
        setMessages((previous) => {
          const next = [...previous];
          const lastIndex = next.length - 1;
          const lastMessage = next[lastIndex];

          if (lastMessage?.role === "assistant") {
            next[lastIndex] = update(lastMessage);
          }

          return next;
        });
      };

      const handleEvent = (line: string) => {
        if (!line.startsWith("data:")) return;

        const payload = line.slice(5).trim();
        if (!payload) return;

        const data = JSON.parse(payload) as StreamEvent;

        if (data.type === "token") {
          receivedToken = true;
          updateAssistant((message) => ({
            ...message,
            content:
  message.content.length === 0
    ? data.token.trimStart()
    : message.content + data.token,
          }));
        } else if (data.type === "done") {
          receivedDone = true;
          updateAssistant((message) => ({
            ...message,
            sources: data.sources,
            usedKnowledge: data.usedKnowledge,
          }));
        } else if (data.type === "error") {
          throw new Error(data.error);
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const rawEvent of events) {
            for (const line of rawEvent.split("\n")) {
              handleEvent(line);
            }
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            handleEvent(line);
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!receivedToken || !receivedDone) {
        throw new Error("The response stream ended before the answer completed.");
      }
    } catch (err) {
      setMessages((previous) => {
        const lastIndex = previous.length - 1;
        const lastMessage = previous[lastIndex];

        if (lastMessage?.role !== "assistant") return previous;

        const next = [...previous];
        next[lastIndex] = {
          ...lastMessage,
          content: lastMessage.content || "Sorry, I couldn't generate a response.",
        };
        return next;
      });

      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the chatbot.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <header className="header">
        <div className="brand-icon">AI</div>
        <div>
          <h1>Knowledge Assistant</h1>
          <p>Local AI chatbot prototype</p>
        </div>
        <span className="status">
          <span className="status-dot" />
          Local prototype
        </span>
      </header>

      <section className="chat">
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-icon">✦</div>
            <h2>How can I help you?</h2>
            <p>Ask a question to test your local AI assistant.</p>
            <button
              className="suggestion"
              type="button"
              onClick={() =>
                setQuestion("What is Moodle and how does it work?")
              }
            >
              What is Moodle and how does it work?
              <span>↗</span>
            </button>
          </div>
        ) : (
          <div className="messages" aria-live="polite">
            {messages.map((message, index) => (
              <article
                className={`message ${message.role}`}
                key={`${index}-${message.role}`}
              >
                <div className="message-label">
                  {message.role === "user" ? "You" : "Assistant"}
                </div>

                <div className="message-content">
                  {message.content}
                  {loading &&
                    message.role === "assistant" &&
                    index === messages.length - 1 && (
                      <span className="stream-cursor" aria-hidden="true" />
                    )}
                  {loading &&
                    message.role === "assistant" &&
                    index === messages.length - 1 &&
                    !message.content && (
                      <span className="thinking-indicator">
                        Searching knowledge and generating answer…
                      </span>
                    )}
                </div>

                {message.role === "assistant" && message.content && (
                  <div className="message-sources">
                    {message.usedKnowledge && message.sources?.length ? (
                      <>
                        <strong>Sources:</strong>
                        <ul>
                          {message.sources.map((source) => (
                            <li key={source}>{source}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <span>
                        No matching local knowledge sources were found.
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="question">
          Your question
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask your question..."
          rows={2}
          maxLength={2000}
          disabled={loading}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="composer-footer">
          <span>Enter to send · Shift+Enter for a new line</span>
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? "Generating..." : "Send ↑"}
          </button>
        </div>
      </form>

      <footer className="footer">
        Prototype only · Answers are generated by a local AI model
      </footer>
    </main>
  );
}

export default App;


import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const knowledgeDirectory = path.resolve(
  currentDirectory,
  "../knowledge"
);

type KnowledgeChunk = {
  source: string;
  content: string;
};

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by",
  "can", "do", "for", "from", "how", "i", "in", "is",
  "it", "of", "on", "or", "the", "to", "what", "with"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopWords.has(word));
}

async function loadKnowledge(): Promise<KnowledgeChunk[]> {
  const files = await readdir(knowledgeDirectory);
  const markdownFiles = files.filter((file) => file.endsWith(".md"));

  const chunks: KnowledgeChunk[] = [];

  for (const file of markdownFiles) {
    const fullPath = path.join(knowledgeDirectory, file);
    const document = await readFile(fullPath, "utf8");

    const paragraphs = document
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    for (const paragraph of paragraphs) {
      chunks.push({
        source: file,
        content: paragraph,
      });
    }
  }

  return chunks;
}

export async function searchKnowledge(
  question: string,
  limit = 4
): Promise<KnowledgeChunk[]> {
  const questionWords = [...new Set(tokenize(question))];

  if (questionWords.length === 0) {
    return [];
  }

  const chunks = await loadKnowledge();

  const ranked = chunks
    .map((chunk) => {
      const chunkWords = new Set(tokenize(chunk.content));

      const score = questionWords.reduce(
        (total, word) => total + (chunkWords.has(word) ? 1 : 0),
        0
      );

      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map(({ source, content }) => ({
    source,
    content,
  }));
}

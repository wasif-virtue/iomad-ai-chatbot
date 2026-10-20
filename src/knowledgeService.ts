
import { readdir, readFile } from "node:fs/promises";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const knowledgeDirectory = path.resolve(
  currentDirectory,
  "../knowledge",
);

const OLLAMA_URL = "http://127.0.0.1:11434";
const EMBEDDING_MODEL = "nomic-embed-text";
const MAX_RESULTS = 4;
const MIN_SIMILARITY = 0.35;

async function extractDocumentText(
  filePath: string,
  fileName: string,
): Promise<string> {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".md") {
    return readFile(filePath, "utf8");
  }

  if (extension === ".pdf") {
    const buffer = await readFile(filePath);
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({
      path: filePath,
    });
    return result.value;
  }

  throw new Error(`Unsupported document type: ${extension}`);
}
type KnowledgeChunk = {
  source: string;
  content: string;
  embedding: number[];
};

type OllamaEmbeddingResponse = {
  embeddings?: number[][];
  error?: string;
};

async function createEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama embedding request failed: HTTP ${response.status}`,
    );
  }

  const data: OllamaEmbeddingResponse = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  if (
    !data.embeddings ||
    data.embeddings.length !== texts.length
  ) {
    throw new Error(
      "Ollama did not return an embedding for every input.",
    );
  }

  return data.embeddings;
}

async function loadKnowledge(): Promise<KnowledgeChunk[]> {
  const files = await readdir(knowledgeDirectory);

  const supportedFiles = files
  .filter((file) => /\.(md|pdf|docx)$/i.test(file))
  .sort();

  const chunks: Omit<KnowledgeChunk, "embedding">[] = [];

  for (const file of supportedFiles) {
  const fullPath = path.join(knowledgeDirectory, file);

  try {
    const document = await extractDocumentText(fullPath, file);

    const paragraphs = document
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    for (const paragraph of paragraphs) {
      chunks.push({ source: file, content: paragraph });
    }
  } catch (error) {
    console.error(`Failed to read knowledge file "${file}":`, error);
    throw new Error(`Could not load knowledge file: ${file}`);
  }
}

  if (chunks.length === 0) {
    return [];
  }

  // Embed all document passages in one request.
  const embeddings = await createEmbeddings(
    chunks.map((chunk) => chunk.content),
  );

  
return chunks.map((chunk, index): KnowledgeChunk => {
  const embedding = embeddings[index];

  if (!embedding) {
    throw new Error(
      `Missing embedding for passage from ${chunk.source}`,
    );
  }

  return {
    ...chunk,
    embedding,
  };
});

}

let knowledgeCache: Promise<KnowledgeChunk[]> | null = null;

function getKnowledge(): Promise<KnowledgeChunk[]> {
  if (!knowledgeCache) {
    knowledgeCache = loadKnowledge().catch((error) => {
      // Allow another attempt if the initial load fails.
      knowledgeCache = null;
      throw error;
    });
  }

  return knowledgeCache;
}

function cosineSimilarity(
  a: number[],
  b: number[],
): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  
for (let i = 0; i < a.length; i++) {
  const valueA = a[i];
  const valueB = b[i];

  if (valueA === undefined || valueB === undefined) {
    return 0;
  }

  dotProduct += valueA * valueB;
  magnitudeA += valueA * valueA;
  magnitudeB += valueB * valueB;
}


  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return (
    dotProduct /
    (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
  );
}

export async function searchKnowledge(
  question: string,
  limit = MAX_RESULTS,
): Promise<{ source: string; content: string }[]> {
  const chunks = await getKnowledge();

  if (chunks.length === 0 || !question.trim()) {
    return [];
  }

  // Embed the question using the same model as the documents.
  
const [questionEmbedding] = await createEmbeddings([
  question,
]);

if (!questionEmbedding) {
  throw new Error(
    "Ollama did not return an embedding for the question.",
  );
}


  const ranked = chunks
    .map((chunk) => ({
      source: chunk.source,
      content: chunk.content,
      score: cosineSimilarity(
        questionEmbedding,
        chunk.embedding,
      ),
    }))
    .filter((chunk) => chunk.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit));

  return ranked.map(({ source, content }) => ({
    source,
    content,
  }));
}

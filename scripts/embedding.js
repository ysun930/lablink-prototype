const COHERE_API_KEY = process.env.COHERE_API_KEY;

// Cache object: stores embeddings so the same text does not call the API again
const embeddingCache = {};

async function getEmbedding(text) {
  if (!text) {
    return [];
  }

  // If this text was already embedded before, use the saved version
  if (embeddingCache[text]) {
    return embeddingCache[text];
  }

  const response = await fetch("https://api.cohere.ai/v1/embed", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + COHERE_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      texts: [text],
      model: "embed-english-light-v3.0",
      input_type: "search_document"
    })
  });

  const data = await response.json();

  if (!data.embeddings || !data.embeddings[0]) {
    throw new Error("Cohere embedding API did not return an embedding.");
  }

  // Save embedding in cache
  embeddingCache[text] = data.embeddings[0];

  return embeddingCache[text];
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (magA * magB);
}

async function semanticScore(candidateStatement, labDescription) {
  const [candidateEmbedding, labEmbedding] = await Promise.all([
    getEmbedding(candidateStatement),
    getEmbedding(labDescription)
  ]);

  return cosineSimilarity(candidateEmbedding, labEmbedding);
}

// Precompute all lab embeddings once
async function precomputeLabEmbeddings(labs) {
  for (const labId in labs) {
    const lab = labs[labId];

    if (lab.Lab_Description_FreeText) {
      await getEmbedding(lab.Lab_Description_FreeText);
    }
  }

  console.log("Lab embeddings precomputed and cached.");
}

module.exports = {
  getEmbedding,
  cosineSimilarity,
  semanticScore,
  precomputeLabEmbeddings
};

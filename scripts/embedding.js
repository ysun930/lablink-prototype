async function getEmbedding(text) {
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
  return data.embeddings[0];
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
  const [candVec, labVec] = await Promise.all([
    getEmbedding(candidateStatement),
    getEmbedding(labDescription)
  ]);

  return cosineSimilarity(candVec, labVec);
}
async function scoreCandidate(candidate, lab, matchingPairs) {
  const rule = scoreCandidateVsLab(candidate, lab, matchingPairs);

  const semantic = await semanticScore(
    candidate.Research_Statement_FreeText,
    lab.Lab_Description_FreeText
  );

  const semanticPercent = semantic * 100;

  const combined = (rule.rulePercent * 0.7) + (semanticPercent * 0.3);

  return {
    ...rule,
    semanticPercent: semanticPercent,
    combinedPercent: combined
  };
}

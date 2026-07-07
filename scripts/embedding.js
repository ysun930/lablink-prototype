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

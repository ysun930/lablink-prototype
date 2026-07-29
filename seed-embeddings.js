const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function seedEmbeddings() {
  const { data: labs } = await supabase
    .from('labs')
    .select('id, description');

  console.log('Labs to embed:', labs.length);

  for (const lab of labs) {
    const res = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.COHERE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'embed-v4.0',
        texts: [lab.description],
        input_type: 'search_document',
        embedding_types: ['float'],
        output_dimension: 1024,
        truncate: 'END'
      })
    });

    const data = await res.json();
    const embedding = data.embeddings?.float?.[0];

    if (!embedding) {
      console.error('No embedding returned for lab:', lab.id);
      continue;
    }

    await supabase.from('labs')
      .update({ description_embedding: embedding })
      .eq('id', lab.id);

    console.log('Embedded:', lab.id);
  }
  console.log('Done. All labs have embeddings.');
}

seedEmbeddings();
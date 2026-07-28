const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local")
});

const supabaseUrl = String(
  process.env.SUPABASE_URL || ""
).trim();

const serviceKey = String(
  process.env.SUPABASE_SERVICE_KEY || ""
).trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local."
  );

  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  serviceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const pairsPath = path.join(
  __dirname,
  "..",
  "data",
  "matchingPairs.json"
);

if (!fs.existsSync(pairsPath)) {
  console.error(
    "Could not find data/matchingPairs.json."
  );

  process.exit(1);
}

let fileContent;

try {
  fileContent = JSON.parse(
    fs.readFileSync(pairsPath, "utf8")
  );
} catch (error) {
  console.error(
    "matchingPairs.json is not valid JSON:",
    error.message
  );

  process.exit(1);
}

const matchingPairs = Array.isArray(fileContent)
  ? fileContent
  : (
      fileContent.matchingPairs ||
      fileContent.matching_pairs ||
      fileContent.pairs
    );

if (!Array.isArray(matchingPairs)) {
  console.error(
    "data/matchingPairs.json must contain an array."
  );

  process.exit(1);
}

function firstValue(object, keys, fallback = null) {
  for (const key of keys) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return fallback;
}

function normalizeWeight(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 1;
}

function normalizePair(pair, index) {
  return {
    pair_id: String(
      firstValue(
        pair,
        [
          "Pair_ID",
          "pair_id",
          "PairID",
          "pairId"
        ],
        `PAIR-${String(index + 1).padStart(3, "0")}`
      )
    ),

    variable_type: firstValue(
      pair,
      [
        "Variable_Type",
        "variable_type",
        "VariableType",
        "variableType",
        "Category",
        "category"
      ]
    ),

    dataset_a_var: firstValue(
      pair,
      [
        "Dataset_A_Var",
        "dataset_a_var",
        "Dataset_A_Variable",
        "dataset_a_variable",
        "A_Variable",
        "a_variable",
        "Lab_Variable",
        "lab_variable"
      ]
    ),

    dataset_b_var: firstValue(
      pair,
      [
        "Dataset_B_Var",
        "dataset_b_var",
        "Dataset_B_Variable",
        "dataset_b_variable",
        "B_Variable",
        "b_variable",
        "Candidate_Variable",
        "candidate_variable"
      ]
    ),

    weight: normalizeWeight(
      firstValue(
        pair,
        [
          "Weight",
          "weight",
          "weight_i",
          "Weight_i"
        ],
        1
      )
    ),

    match_type: firstValue(
      pair,
      [
        "Match_Type",
        "match_type",
        "MatchType",
        "matchType"
      ],
      "Exact"
    )
  };
}

function pairKey(pair) {
  return [
    pair.pair_id || "",
    pair.dataset_a_var || "",
    pair.dataset_b_var || ""
  ].join("|").toLowerCase();
}

async function importPairs() {
  const {
    data: existingRows,
    error: readError
  } = await supabase
    .from("matching_pairs")
    .select(
      "pair_id, dataset_a_var, dataset_b_var"
    );

  if (readError) {
    throw readError;
  }

  const existingKeys = new Set(
    (existingRows || []).map(pairKey)
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (
    let index = 0;
    index < matchingPairs.length;
    index++
  ) {
    const pair = normalizePair(
      matchingPairs[index],
      index
    );

    if (
      !pair.dataset_a_var ||
      !pair.dataset_b_var
    ) {
      console.error(
        `Failed: ${pair.pair_id} — missing dataset_a_var or dataset_b_var`
      );

      failed++;
      continue;
    }

    const key = pairKey(pair);

    if (existingKeys.has(key)) {
      console.log(
        `Skipped: ${pair.pair_id}`
      );

      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("matching_pairs")
      .insert(pair);

    if (error) {
      console.error(
        `Failed: ${pair.pair_id} — ${error.message}`
      );

      failed++;
      continue;
    }

    console.log(
      `Imported: ${pair.pair_id}`
    );

    existingKeys.add(key);
    imported++;
  }

  console.log("");
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

importPairs().catch(error => {
  console.error(
    "Import failed:",
    error.message
  );

  process.exit(1);
});
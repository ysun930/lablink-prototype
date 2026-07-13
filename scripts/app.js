let labsData = [];
let candidatesData = [];

// Cache object to reduce repeated Cohere API calls
const embeddingCache = {};

// Run after the webpage finishes loading
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load JSON files from the data folder
    const [labsResponse, candidatesResponse] = await Promise.all([
      fetch("../data/labs.json"),
      fetch("../data/candidates.json")
    ]);

    const labsRaw = await labsResponse.json();
    const candidatesRaw = await candidatesResponse.json();

    // Normalize raw data before scoring
    labsData = labsRaw.map(normalizeLab);
    candidatesData = candidatesRaw.map(normalizeCandidate);

    // Precompute lab embeddings once on page load
    await precomputeLabEmbeddings(labsData);

    console.log("Data loaded. Lab embeddings precomputed.");

    // Connect the candidate form to the submit handler
    const form = document.getElementById("candidate-form");

    if (form) {
      form.addEventListener("submit", handleCandidateSubmit);
      console.log("Candidate form submit event connected.");
    } else {
      console.warn("candidate-form not found on this page.");
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
});

// Standardizes text for easier matching
function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/&/g, "and")
    .replace(/\bwestern blotting\b/g, "western blot")
    .replace(/\bconfocal imaging\b/g, "confocal microscopy")
    .replace(/\bbiotech\b/g, "biotechnology")
    .replace(/\bpharma\b/g, "pharmaceutical")
    .replace(/\s+/g, " ")
    .trim();
}

// Converts comma-separated or semicolon-separated text into an array
function splitList(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitList);
  }

  if (!value) {
    return [];
  }

  return String(value)
    .split(/[,;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

// Checks whether candidate value and lab value match exactly or partially
function valuesMatch(candidateValue, labValue) {
  const candidateArray = Array.isArray(candidateValue)
    ? candidateValue
    : splitList(candidateValue);

  const labArray = Array.isArray(labValue)
    ? labValue
    : splitList(labValue);

  return candidateArray.some(candidateItem =>
    labArray.some(labItem => {
      const c = normalizeText(candidateItem);
      const l = normalizeText(labItem);

      return c === l || c.includes(l) || l.includes(c);
    })
  );
}

// Standardizes education level labels
function normalizeEducation(value) {
  const text = normalizeText(value);

  if (text.includes("freshman")) return "Freshman";
  if (text.includes("sophomore")) return "Sophomore";
  if (text.includes("junior")) return "Junior";
  if (text.includes("senior")) return "Senior";
  if (text.includes("post")) return "Postbac";
  if (text.includes("ms")) return "MS";
  if (text.includes("phd")) return "PhD";

  return value;
}

// Standardizes availability labels
function normalizeHours(value) {
  const text = normalizeText(value);

  if (text.includes("less than 10")) return "Less than 10 hours";
  if (text.includes("10 20") || text.includes("part time")) return "Part-time";
  if (text.includes("20+") || text.includes("full time")) return "Full-time";

  return value;
}

// Standardizes compensation labels
function normalizeCompensation(value) {
  const text = normalizeText(value);

  if (text.includes("paid")) return "Paid";
  if (text.includes("credit") || text.includes("for credit")) return "For-credit";

  return value;
}

// Standardizes remote / hybrid / in-person preference
function normalizeRemote(value) {
  const text = normalizeText(value);

  if (text.includes("in person")) return "In-person only";
  if (text.includes("hybrid") || text.includes("flexible")) return "Hybrid";
  if (text.includes("remote")) return "Remote";

  return value;
}

// Removes proficiency labels such as "(Advanced)"
function cleanSkill(skill) {
  return String(skill)
    .replace(/\([^)]*\)/g, "")
    .replace(/—.*/g, "")
    .trim();
}

// Converts raw candidate JSON into algorithm format
function normalizeCandidate(raw) {
  return {
    Candidate_ID: raw.Candidate_ID,
    Candidate_Name: raw.Candidate_Name,

    Primary_Field_Interest: raw.Primary_Field_Interest,
    Sub_discipline_Interests: splitList(raw.Sub_discipline_Interests),
    Confirmed_Skills: splitList(raw.Confirmed_Skills).map(cleanSkill),

    Career_Goal: raw.Career_Goal,
    Education_Level: normalizeEducation(raw.Education_Level),
    Hours_Available: normalizeHours(raw.Hours_Available),
    Compensation_Need: normalizeCompensation(raw.Compensation_Need),
    Remote_Preference: normalizeRemote(raw.Remote_Preference),

    Research_Statement_FreeText: raw.Research_Statement_FreeText
  };
}

// Converts raw lab JSON into algorithm format
function normalizeLab(raw) {
  const requiredSkills = splitList(raw.Required_Techniques);
  const preferredSkills = splitList(raw.Preferred_Techniques);

  return {
    Lab_ID: raw["Lab_ID (LAB-001 to LAB-005)"] || raw.Lab_ID,
    Lab_Name: raw.Lab_Name,

    Primary_Field: raw.Primary_Field,
    Sub_discipline: splitList(raw.Sub_disciplines),

    Required_Skills: [...requiredSkills, ...preferredSkills].map(cleanSkill),

    Career_Goal: splitList(raw.Career_Pathways_Supported),
    Hiree_Level: splitList(raw.Hiree_Level_Sought).map(normalizeEducation),
    Hours: normalizeHours(raw.Hours_Per_Week),
    Compensation: normalizeCompensation(raw.Compensation),
    Remote: normalizeRemote(raw.Remote_Option),

    Lab_Description_FreeText: raw.Lab_Description_FreeText
  };
}

// Gets input value safely from the form
function getInputValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

// Builds a candidate object from form input
function buildCandidateFromForm() {
  return {
    Candidate_ID: "USER-CANDIDATE",
    Candidate_Name: getInputValue("candidate-name"),

    Primary_Field_Interest: getInputValue("primary-field"),
    Sub_discipline_Interests: splitList(getInputValue("sub-discipline")),
    Confirmed_Skills: splitList(getInputValue("skills")).map(cleanSkill),

    Career_Goal: getInputValue("career-goal"),
    Education_Level: normalizeEducation(getInputValue("education-level")),
    Hours_Available: normalizeHours(getInputValue("hours-available")),
    Compensation_Need: normalizeCompensation(getInputValue("compensation-need")),
    Remote_Preference: normalizeRemote(getInputValue("remote-preference")),

    Research_Statement_FreeText: getInputValue("research-statement")
  };
}

// Calculates partial technique score
function skillScore(candidateSkills, labSkills, weight) {
  let matchedCount = 0;

  for (const labSkill of labSkills) {
    if (candidateSkills.some(skill => valuesMatch(skill, labSkill))) {
      matchedCount++;
    }
  }

  return weight * (matchedCount / labSkills.length);
}

// Converts score / max into percentage
function percent(score, max) {
  if (max === 0) return 0;
  return (score / max) * 100;
}

// Calculates rule-based field, technique, and goal scores
function calculateRuleScores(candidate, lab) {
  let fieldScore = 0;
  let fieldMax = 0;

  let techniqueScore = 0;
  let techniqueMax = 0;

  let goalScore = 0;
  let goalMax = 0;

  function addFieldMatch(candidateValue, labValue, weight) {
    fieldMax += weight;
    if (valuesMatch(candidateValue, labValue)) {
      fieldScore += weight;
    }
  }

  function addGoalMatch(candidateValue, labValue, weight) {
    goalMax += weight;
    if (valuesMatch(candidateValue, labValue)) {
      goalScore += weight;
    }
  }

  // Field scoring
  addFieldMatch(candidate.Primary_Field_Interest, lab.Primary_Field, 3);
  addFieldMatch(candidate.Sub_discipline_Interests, lab.Sub_discipline, 2);

  // Technique scoring
  techniqueMax += 18;
  techniqueScore += skillScore(candidate.Confirmed_Skills, lab.Required_Skills, 18);

  // Goal scoring
  addGoalMatch(candidate.Career_Goal, lab.Career_Goal, 3);
  addGoalMatch(candidate.Education_Level, lab.Hiree_Level, 3);
  addGoalMatch(candidate.Hours_Available, lab.Hours, 3);
  addGoalMatch(candidate.Compensation_Need, lab.Compensation, 2);
  addGoalMatch(candidate.Remote_Preference, lab.Remote, 3);

  const ruleScore = fieldScore + techniqueScore + goalScore;
  const ruleMax = fieldMax + techniqueMax + goalMax;

  return {
    fieldScore,
    fieldMax,
    fieldPercent: percent(fieldScore, fieldMax),

    techniqueScore,
    techniqueMax,
    techniquePercent: percent(techniqueScore, techniqueMax),

    goalScore,
    goalMax,
    goalPercent: percent(goalScore, goalMax),

    ruleScore,
    ruleMax,
    rulePercent: percent(ruleScore, ruleMax)
  };
}

// Gets embedding from Cohere API with cache
async function getEmbedding(text) {
  if (!text) return [];

  if (embeddingCache[text]) {
    return embeddingCache[text];
  }

  const response = await fetch("https://api.cohere.ai/v1/embed", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + window.COHERE_API_KEY,
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
    throw new Error("Cohere API did not return an embedding.");
  }

  embeddingCache[text] = data.embeddings[0];
  return embeddingCache[text];
}

// Calculates cosine similarity between two embedding vectors
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

// AI semantic scoring between candidate statement and lab description
async function semanticScore(candidateStatement, labDescription) {
  const [candidateEmbedding, labEmbedding] = await Promise.all([
    getEmbedding(candidateStatement),
    getEmbedding(labDescription)
  ]);

  return cosineSimilarity(candidateEmbedding, labEmbedding);
}

// Precomputes all lab embeddings once on page load
async function precomputeLabEmbeddings(labs) {
  for (const lab of labs) {
    await getEmbedding(lab.Lab_Description_FreeText);
  }

  console.log("Lab embeddings precomputed and cached.");
}

// Combines rule-based score and AI semantic score
async function scoreCandidate(candidate, lab) {
  const rule = calculateRuleScores(candidate, lab);

  const semantic = await semanticScore(
    candidate.Research_Statement_FreeText,
    lab.Lab_Description_FreeText
  );

  const semanticPercent = semantic * 100;

  // Final combined score: 80% rule-based + 20% AI semantic
  const combinedPercent = rule.rulePercent * 0.8 + semanticPercent * 0.2;

  return {
    Candidate_ID: candidate.Candidate_ID,
    Candidate_Name: candidate.Candidate_Name,
    Lab_ID: lab.Lab_ID,
    Lab_Name: lab.Lab_Name,

    ...rule,

    semanticPercent,
    combinedPercent
  };
}

// Handles form submit and ranks all labs for the submitted candidate
async function handleCandidateSubmit(event) {
  event.preventDefault();

  const candidate = buildCandidateFromForm();
  const results = [];

  for (const lab of labsData) {
    const result = await scoreCandidate(candidate, lab);
    results.push(result);
  }

  // Sort from best match to weakest match
  results.sort((a, b) => b.combinedPercent - a.combinedPercent);

  // Save results for results page
  sessionStorage.setItem("lablinkResults", JSON.stringify(results));
  sessionStorage.setItem("submittedCandidate", JSON.stringify(candidate));

  console.log("Ranking results saved to sessionStorage.");
  console.table(results);

  // Navigate to results page
  window.location.href = "results.html";
}

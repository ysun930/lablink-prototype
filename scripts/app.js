// app.js
// Loads data, runs rule-based and AI semantic scoring,
// ranks labs, and saves results to sessionStorage.

let labsData = [];
let candidatesData = [];

// Cache embeddings to avoid repeated Cohere API calls
const embeddingCache = {};

// Run after pages/index.html finishes loading
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Load lab and candidate JSON files
    const [labsResponse, candidatesResponse] = await Promise.all([
      fetch("../data/labs.json"),
      fetch("../data/candidates.json")
    ]);

    if (!labsResponse.ok) {
      throw new Error(
        `Could not load labs.json: ${labsResponse.status}`
      );
    }

    if (!candidatesResponse.ok) {
      throw new Error(
        `Could not load candidates.json: ${candidatesResponse.status}`
      );
    }

    const labsRaw = await labsResponse.json();
    const candidatesRaw = await candidatesResponse.json();

    // Convert raw JSON into the scorer's standard format
    labsData = labsRaw.map(normalizeLab);
    candidatesData = candidatesRaw.map(normalizeCandidate);

    // Compute all lab embeddings once when the page loads
    await precomputeLabEmbeddings(labsData);

    console.log("Data loaded. Lab embeddings precomputed.");

    // Connect the candidate form to the submit function
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

// Standardizes text before matching
function normalizeText(value) {
  return String(value ?? "")
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

function valuesMatch(candidateValue, labValue) {
  const candidateArray = Array.isArray(candidateValue)
    ? candidateValue
    : splitList(candidateValue);

  const labArray = Array.isArray(labValue)
    ? labValue
    : splitList(labValue);

  return candidateArray.some(candidateItem =>
    labArray.some(labItem => {
      const candidateText = normalizeText(candidateItem);
      const labText = normalizeText(labItem);

      if (!candidateText || !labText) {
        return false;
      }

      // Exact matches are always accepted
      if (candidateText === labText) {
        return true;
      }

      // Prevent short values such as "R" or "MS"
      // from matching parts of longer words
      if (
        candidateText.length < 4 ||
        labText.length < 4
      ) {
        return false;
      }

      return (
        candidateText.includes(labText) ||
        labText.includes(candidateText)
      );
    })
  );
}

// Standardizes education levels
function normalizeEducation(value) {
  const text = normalizeText(value);

  if (text.includes("freshman")) return "Freshman";
  if (text.includes("sophomore")) return "Sophomore";
  if (text.includes("junior")) return "Junior";
  if (text.includes("senior")) return "Senior";
  if (text.includes("post")) return "Postbac";
  if (text.includes("master") || text === "ms") return "MS";
  if (text.includes("phd")) return "PhD";

  return value;
}

// Standardizes availability values
function normalizeHours(value) {
  const text = normalizeText(value);

  if (text.includes("less than 10")) {
    return "Less than 10 hours";
  }

  if (
    text.includes("10 20") ||
    text.includes("part time")
  ) {
    return "Part-time";
  }

  if (
    text.includes("20+") ||
    text.includes("full time")
  ) {
    return "Full-time";
  }

  return value;
}

// Standardizes compensation values
function normalizeCompensation(value) {
  const text = normalizeText(value);

  if (text.includes("paid")) {
    return "Paid";
  }

  if (
    text.includes("credit") ||
    text.includes("for credit")
  ) {
    return "For-credit";
  }

  return value;
}

// Standardizes in-person, hybrid, and remote values
function normalizeRemote(value) {
  const text = normalizeText(value);

  if (text.includes("in person")) {
    return "In-person only";
  }

  if (
    text.includes("hybrid") ||
    text.includes("flexible")
  ) {
    return "Hybrid";
  }

  if (text.includes("remote")) {
    return "Remote";
  }

  return value;
}

// Removes proficiency labels such as "(Advanced)"
function cleanSkill(skill) {
  return String(skill)
    .replace(/\([^)]*\)/g, "")
    .replace(/—.*/g, "")
    .trim();
}

// Converts candidate JSON into scorer format
function normalizeCandidate(raw) {
  return {
    Candidate_ID: raw.Candidate_ID,
    Candidate_Name: raw.Candidate_Name,

    Primary_Field_Interest:
      raw.Primary_Field_Interest,

    Sub_discipline_Interests:
      splitList(raw.Sub_discipline_Interests),

    Confirmed_Skills:
      splitList(raw.Confirmed_Skills).map(cleanSkill),

    Career_Goal:
      raw.Career_Goal,

    Education_Level:
      normalizeEducation(raw.Education_Level),

    Hours_Available:
      normalizeHours(raw.Hours_Available),

    Compensation_Need:
      normalizeCompensation(raw.Compensation_Need),

    Remote_Preference:
      normalizeRemote(raw.Remote_Preference),

    Research_Statement_FreeText:
      raw.Research_Statement_FreeText
  };
}

// Converts lab JSON into scorer format
function normalizeLab(raw) {
  const requiredSkills =
    splitList(raw.Required_Techniques);

  const preferredSkills =
    splitList(raw.Preferred_Techniques);

  return {
    Lab_ID:
      raw["Lab_ID (LAB-001 to LAB-005)"] ||
      raw.Lab_ID,

    Lab_Name:
      raw.Lab_Name,

    Primary_Field:
      raw.Primary_Field,

    Sub_discipline:
      splitList(raw.Sub_disciplines),

    // Required and preferred techniques are included
    Required_Skills: [
      ...requiredSkills,
      ...preferredSkills
    ].map(cleanSkill),

    Career_Goal:
      splitList(raw.Career_Pathways_Supported),

    Hiree_Level:
      splitList(raw.Hiree_Level_Sought)
        .map(normalizeEducation),

    Hours:
      normalizeHours(raw.Hours_Per_Week),

    Compensation:
      normalizeCompensation(raw.Compensation),

    Remote:
      normalizeRemote(raw.Remote_Option),

    Lab_Description_FreeText:
      raw.Lab_Description_FreeText,

    // Keep extra information for results and profile pages
    Lab_Aim:
      raw.Lab_Aim,

    Institution_Type:
      raw.Institution_Type,

    Lab_Size:
      raw.Lab_Size,

    Required_Techniques:
      raw.Required_Techniques,

    Preferred_Techniques:
      raw.Preferred_Techniques,

    Career_Pathways_Supported:
      raw.Career_Pathways_Supported,

    Hiree_Level_Sought:
      raw.Hiree_Level_Sought,

    Hours_Per_Week:
      raw.Hours_Per_Week,

    Remote_Option:
      raw.Remote_Option
  };
}

// Safely reads one form input
function getInputValue(id) {
  const element = document.getElementById(id);

  return element
    ? element.value.trim()
    : "";
}

// Builds a candidate object from the submitted form
function buildCandidateFromForm() {
  return {
    Candidate_ID:
      "USER-CANDIDATE",

    Candidate_Name:
      getInputValue("candidate-name"),

    Primary_Field_Interest:
      getInputValue("primary-field"),

    Sub_discipline_Interests:
      splitList(
        getInputValue("sub-discipline")
      ),

    Confirmed_Skills:
      splitList(
        getInputValue("skills")
      ).map(cleanSkill),

    Career_Goal:
      getInputValue("career-goal"),

    Education_Level:
      normalizeEducation(
        getInputValue("education-level")
      ),

    Hours_Available:
      normalizeHours(
        getInputValue("hours-available")
      ),

    Compensation_Need:
      normalizeCompensation(
        getInputValue("compensation-need")
      ),

    Remote_Preference:
      normalizeRemote(
        getInputValue("remote-preference")
      ),

    Research_Statement_FreeText:
      getInputValue("research-statement")
  };
}

// Calculates the technique score
function skillScore(candidateSkills, labSkills, weight) {
  if (
    !Array.isArray(labSkills) ||
    labSkills.length === 0
  ) {
    return 0;
  }

  let matchedCount = 0;

  for (const labSkill of labSkills) {
    const matched = candidateSkills.some(
      candidateSkill =>
        valuesMatch(candidateSkill, labSkill)
    );

    if (matched) {
      matchedCount++;
    }
  }

  return weight *
    (matchedCount / labSkills.length);
}

// Converts score into percentage
function percent(score, max) {
  if (max === 0) {
    return 0;
  }

  return (score / max) * 100;
}

// Calculates field, technique, goal, and total rule scores
function calculateRuleScores(candidate, lab) {
  let fieldScore = 0;
  let fieldMax = 0;

  let techniqueScore = 0;
  let techniqueMax = 0;

  let goalScore = 0;
  let goalMax = 0;

  function addFieldMatch(
    candidateValue,
    labValue,
    weight
  ) {
    fieldMax += weight;

    if (valuesMatch(candidateValue, labValue)) {
      fieldScore += weight;
    }
  }

  function addGoalMatch(
    candidateValue,
    labValue,
    weight
  ) {
    goalMax += weight;

    if (valuesMatch(candidateValue, labValue)) {
      goalScore += weight;
    }
  }

  // Field scoring
  addFieldMatch(
    candidate.Primary_Field_Interest,
    lab.Primary_Field,
    3
  );

  addFieldMatch(
    candidate.Sub_discipline_Interests,
    lab.Sub_discipline,
    2
  );

  // Technique scoring
  techniqueMax += 18;

  techniqueScore += skillScore(
    candidate.Confirmed_Skills,
    lab.Required_Skills,
    18
  );

  // Goal scoring
  addGoalMatch(
    candidate.Career_Goal,
    lab.Career_Goal,
    3
  );

  addGoalMatch(
    candidate.Education_Level,
    lab.Hiree_Level,
    3
  );

  addGoalMatch(
    candidate.Hours_Available,
    lab.Hours,
    3
  );

  addGoalMatch(
    candidate.Compensation_Need,
    lab.Compensation,
    2
  );

  addGoalMatch(
    candidate.Remote_Preference,
    lab.Remote,
    3
  );

  const ruleScore =
    fieldScore +
    techniqueScore +
    goalScore;

  const ruleMax =
    fieldMax +
    techniqueMax +
    goalMax;

  return {
    fieldScore,
    fieldMax,
    fieldPercent:
      percent(fieldScore, fieldMax),

    techniqueScore,
    techniqueMax,
    techniquePercent:
      percent(techniqueScore, techniqueMax),

    goalScore,
    goalMax,
    goalPercent:
      percent(goalScore, goalMax),

    ruleScore,
    ruleMax,
    rulePercent:
      percent(ruleScore, ruleMax)
  };
}

// Gets an embedding from Cohere and stores it in cache
async function getEmbedding(text) {
  if (!text) {
    return [];
  }

  if (embeddingCache[text]) {
    return embeddingCache[text];
  }

  if (!window.COHERE_API_KEY) {
    throw new Error(
      "Cohere API key is missing."
    );
  }

  const response = await fetch(
    "https://api.cohere.ai/v1/embed",
    {
      method: "POST",

      headers: {
        Authorization:
          "Bearer " + window.COHERE_API_KEY,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        texts: [text],
        model: "embed-english-light-v3.0",
        input_type: "search_document"
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      `Cohere API request failed: ${response.status}`
    );
  }

  if (
    !data.embeddings ||
    !data.embeddings[0]
  ) {
    throw new Error(
      "Cohere API did not return an embedding."
    );
  }

  embeddingCache[text] =
    data.embeddings[0];

  return embeddingCache[text];
}

// Calculates cosine similarity
function cosineSimilarity(vecA, vecB) {
  if (
    !Array.isArray(vecA) ||
    !Array.isArray(vecB) ||
    vecA.length === 0 ||
    vecA.length !== vecB.length
  ) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (
    magnitudeA === 0 ||
    magnitudeB === 0
  ) {
    return 0;
  }

  return dot /
    (magnitudeA * magnitudeB);
}

// Calculates AI semantic similarity
async function semanticScore(
  candidateStatement,
  labDescription
) {
  const [
    candidateEmbedding,
    labEmbedding
  ] = await Promise.all([
    getEmbedding(candidateStatement),
    getEmbedding(labDescription)
  ]);

  return cosineSimilarity(
    candidateEmbedding,
    labEmbedding
  );
}

// Precomputes all lab embeddings when the page loads
async function precomputeLabEmbeddings(labs) {
  for (const lab of labs) {
    if (lab.Lab_Description_FreeText) {
      await getEmbedding(
        lab.Lab_Description_FreeText
      );
    }
  }

  console.log(
    "Lab embeddings precomputed and cached."
  );
}

// Creates a short explanation for the AI semantic score
function getSemanticReason(semanticPercent) {
  if (semanticPercent >= 70) {
    return (
      "High: your research statement describes topics " +
      "closely related to this lab's work."
    );
  }

  if (semanticPercent >= 40) {
    return (
      "Moderate: there is some overlap between your " +
      "interests and this lab's research focus."
    );
  }

  return (
    "Low: your research statement and this lab's work " +
    "describe different research areas."
  );
}

// Runs complete scoring for one candidate and one lab
async function scoreCandidate(candidate, lab) {
  const rule =
    calculateRuleScores(candidate, lab);

  const semantic =
    await semanticScore(
      candidate.Research_Statement_FreeText,
      lab.Lab_Description_FreeText
    );

  const semanticPercent =
    semantic * 100;

  // Generate an explanation of the AI score
  const semanticReason =
    getSemanticReason(semanticPercent);

  // Final score: 80% rule + 20% AI
  const combinedPercent =
    rule.rulePercent * 0.8 +
    semanticPercent * 0.2;

  return {
    Candidate_ID:
      candidate.Candidate_ID,

    Candidate_Name:
      candidate.Candidate_Name,

    Lab_ID:
      lab.Lab_ID,

    Lab_Name:
      lab.Lab_Name,

    // Used by results.html and lab-profile.html
    labProfile:
      lab,

    ...rule,

    semanticPercent,
    semanticReason,
    combinedPercent
  };
}

// Runs when the user clicks Find Matches
async function handleCandidateSubmit(event) {
  event.preventDefault();

  const candidate =
    buildCandidateFromForm();

  const results = [];

  try {
    // Compare the submitted candidate against every lab
    for (const lab of labsData) {
      const result =
        await scoreCandidate(candidate, lab);

      results.push(result);
    }

    // Sort highest combined score to lowest
    results.sort(
      (a, b) =>
        b.combinedPercent -
        a.combinedPercent
    );

    if (results.length > 0) {
      console.log(
        "Rule scorer fired:",
        results[0].rulePercent
      );

      console.log(
        "AI scorer fired:",
        results[0].semanticPercent
      );

      console.log(
        "Semantic reason:",
        results[0].semanticReason
      );

      console.log(
        "Combined score:",
        results[0].combinedPercent
      );
    }

    // Same key used by results.html and lab-profile.html
    sessionStorage.setItem(
      "labMatchResults",
      JSON.stringify(results)
    );

    sessionStorage.setItem(
      "submittedCandidate",
      JSON.stringify(candidate)
    );

    console.log(
      "Ranking results saved to sessionStorage."
    );

    console.table(results);

    // Go to pages/results.html
    window.location.href =
      "results.html";
  } catch (error) {
    console.error(
      "Error calculating match results:",
      error
    );

    alert(
      "The match results could not be calculated. " +
      "Check the browser console."
    );
  }
}
async function runFullCandidateTest() {
  const summary = [];

  for (const candidate of candidatesData) {
    const candidateResults = [];

    for (const lab of labsData) {
      const result = await scoreCandidate(candidate, lab);
      candidateResults.push(result);
    }

    candidateResults.sort(
      (a, b) => b.combinedPercent - a.combinedPercent
    );

    const top = candidateResults[0];

    summary.push({
      Candidate: candidate.Candidate_ID,
      "Top Match Lab": top.Lab_ID,
      "Rule %": `${top.rulePercent.toFixed(1)}%`,
      "AI %": `${top.semanticPercent.toFixed(1)}%`,
      "Combined %": `${top.combinedPercent.toFixed(1)}%`
    });
  }

  console.table(summary);

  const csvRows = [
    ["Candidate", "Top Match Lab", "Rule %", "AI %", "Combined %"],
    ...summary.map(row => [
      row.Candidate,
      row["Top Match Lab"],
      row["Rule %"],
      row["AI %"],
      row["Combined %"]
    ])
  ];

  const csv = csvRows
    .map(row => row.join("\t"))
    .join("\n");

  await navigator.clipboard.writeText(csv);

  console.log("Complete table copied to clipboard.");

  return summary;
}

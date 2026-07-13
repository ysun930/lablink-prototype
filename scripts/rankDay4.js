const { semanticScore, precomputeLabEmbeddings } = require("./embedding");

// Stop the program if the Cohere API key is missing
if (!process.env.COHERE_API_KEY) {
  console.error("Missing COHERE_API_KEY. Run: export COHERE_API_KEY='your-key'");
  process.exit(1);
}

// Load candidate and lab sample data from JSON files
const candidatesRaw = require("../data/candidates.json");
const labsRaw = require("../data/labs.json");

// Standardizes text so matching is more flexible
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

// Checks whether two values match exactly or partially
function valuesMatch(candidateValue, labValue) {
  const candidateArray = Array.isArray(candidateValue) ? candidateValue : splitList(candidateValue);
  const labArray = Array.isArray(labValue) ? labValue : splitList(labValue);

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

// Standardizes availability into shared categories
function normalizeHours(value) {
  const text = normalizeText(value);

  if (text.includes("less than 10")) return "Less than 10 hours";
  if (text.includes("10 20") || text.includes("part time")) return "Part-time";
  if (text.includes("20+") || text.includes("full time")) return "Full-time";

  return value;
}

// Standardizes compensation preference
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

// Removes skill proficiency labels such as "(Advanced)"
function cleanSkill(skill) {
  return String(skill)
    .replace(/\([^)]*\)/g, "")
    .replace(/—.*/g, "")
    .trim();
}

// Converts raw candidate JSON into the format used by the algorithm
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

// Converts raw lab JSON into the format used by the algorithm
function normalizeLab(raw) {
  const requiredSkills = splitList(raw.Required_Techniques);
  const preferredSkills = splitList(raw.Preferred_Techniques);

  return {
    Lab_ID: raw["Lab_ID (LAB-001 to LAB-005)"],
    Lab_Name: raw.Lab_Name,

    Primary_Field: raw.Primary_Field,
    Sub_discipline: splitList(raw.Sub_disciplines),

    // Required and preferred techniques are both included in technique scoring
    Required_Skills: [...requiredSkills, ...preferredSkills].map(cleanSkill),

    Career_Goal: splitList(raw.Career_Pathways_Supported),
    Hiree_Level: splitList(raw.Hiree_Level_Sought).map(normalizeEducation),
    Hours: normalizeHours(raw.Hours_Per_Week),
    Compensation: normalizeCompensation(raw.Compensation),
    Remote: normalizeRemote(raw.Remote_Option),

    Lab_Description_FreeText: raw.Lab_Description_FreeText
  };
}

// Normalize all candidate and lab records before scoring
const candidates = candidatesRaw.map(normalizeCandidate);
const labs = labsRaw.map(normalizeLab);

// Calculates partial technique score based on how many lab skills the candidate has
function skillScore(candidateSkills, labSkills, weight) {
  let matchedCount = 0;

  for (const labSkill of labSkills) {
    if (candidateSkills.some(skill => valuesMatch(skill, labSkill))) {
      matchedCount++;
    }
  }

  return weight * (matchedCount / labSkills.length);
}

// Converts score / max into a percentage
function percent(score, max) {
  if (max === 0) return 0;
  return (score / max) * 100;
}

// Calculates field, technique, goal, and total rule-based scores
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

  // Field scoring: compares research field and sub-discipline interests
  addFieldMatch(candidate.Primary_Field_Interest, lab.Primary_Field, 3);
  addFieldMatch(candidate.Sub_discipline_Interests, lab.Sub_discipline, 2);

  // Technique scoring: compares candidate skills with lab required/preferred techniques
  techniqueMax += 18;
  techniqueScore += skillScore(candidate.Confirmed_Skills, lab.Required_Skills, 18);

  // Goal scoring: compares career goal, education level, schedule, pay, and location preference
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

// Combines rule-based score with AI semantic similarity score
async function scoreCandidate(candidate, lab) {
  const rule = calculateRuleScores(candidate, lab);

  // AI semantic scoring compares free-text research statement and lab description
  const semantic = await semanticScore(
    candidate.Research_Statement_FreeText,
    lab.Lab_Description_FreeText
  );

  const semanticPercent = semantic * 100;

  // Final combined score uses 80% rule-based score and 20% AI semantic score
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

// Ranks all 8 labs for one selected candidate
async function rankLabsForCandidate(candidateId) {
  const candidate = candidates.find(c => c.Candidate_ID === candidateId);

  if (!candidate) {
    console.error(`Candidate not found: ${candidateId}`);
    return;
  }

  const results = [];

  for (const lab of labs) {
    const result = await scoreCandidate(candidate, lab);
    results.push(result);
  }

  // Sort labs from highest combined score to lowest
  results.sort((a, b) => b.combinedPercent - a.combinedPercent);

  console.log(`\nRANK ALL 8 LABS VS ${candidateId}`);
  console.log("================================");

  console.table(
    results.map((r, index) => ({
      Rank: index + 1,
      Lab: r.Lab_ID,
      Lab_Name: r.Lab_Name,
      Field: `${r.fieldPercent.toFixed(1)}%`,
      Technique: `${r.techniquePercent.toFixed(1)}%`,
      Goal: `${r.goalPercent.toFixed(1)}%`,
      Rule: `${r.rulePercent.toFixed(1)}%`,
      Semantic: `${r.semanticPercent.toFixed(1)}%`,
      Combined: `${r.combinedPercent.toFixed(1)}%`
    }))
  );
}

// Ranks all 8 candidates for one selected lab
async function rankCandidatesForLab(labId) {
  const lab = labs.find(l => l.Lab_ID === labId);

  if (!lab) {
    console.error(`Lab not found: ${labId}`);
    return;
  }

  const results = [];

  for (const candidate of candidates) {
    const result = await scoreCandidate(candidate, lab);
    results.push(result);
  }

  // Sort candidates from highest combined score to lowest
  results.sort((a, b) => b.combinedPercent - a.combinedPercent);

  console.log(`\nRANK ALL 8 CANDIDATES VS ${labId}`);
  console.log("====================================");

  console.table(
    results.map((r, index) => ({
      Rank: index + 1,
      Candidate: r.Candidate_ID,
      Candidate_Name: r.Candidate_Name,
      Field: `${r.fieldPercent.toFixed(1)}%`,
      Technique: `${r.techniquePercent.toFixed(1)}%`,
      Goal: `${r.goalPercent.toFixed(1)}%`,
      Rule: `${r.rulePercent.toFixed(1)}%`,
      Semantic: `${r.semanticPercent.toFixed(1)}%`,
      Combined: `${r.combinedPercent.toFixed(1)}%`
    }))
  );
}

// Main function runs both Day 4 ranking tests
async function main() {
  const labsById = {};

  for (const lab of labs) {
    labsById[lab.Lab_ID] = lab;
  }

  // Precompute lab embeddings once to reduce repeated API calls
  await precomputeLabEmbeddings(labsById);

  // Test 1: rank all labs for CAND-001
  await rankLabsForCandidate("CAND-001");

  // Test 2: rank all candidates for LAB-001
  await rankCandidatesForLab("LAB-001");
}

main();

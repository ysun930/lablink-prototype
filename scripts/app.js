// scripts/app.js

let labsData = [];
let candidatesData = [];

const embeddingCache = new Map();

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);

async function initializeApp() {
  const form = document.getElementById(
    "candidate-form"
  );

  if (!form) {
    return;
  }

  try {
    const [labsResponse, candidatesResponse] =
      await Promise.all([
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

    const rawLabs = await labsResponse.json();
    const rawCandidates =
      await candidatesResponse.json();

    labsData = rawLabs.map(normalizeLab);

    candidatesData =
      rawCandidates.map(normalizeCandidate);

    console.log(
      `Loaded ${candidatesData.length} candidates ` +
      `and ${labsData.length} labs.`
    );

    if (window.COHERE_API_KEY) {
      await precomputeLabEmbeddings(labsData);

      console.log(
        "Lab embeddings precomputed and cached."
      );
    } else {
      console.warn(
        "Cohere API key is missing from config.js."
      );
    }

    form.addEventListener(
      "submit",
      handleCandidateSubmit
    );

    console.log(
      "Candidate form connected to app.js."
    );
  } catch (error) {
    console.error(
      "Application initialization failed:",
      error
    );

    setStatus(
      "The data could not be loaded. Check the Console.",
      true
    );
  }
}

function setStatus(message, isError = false) {
  const element =
    document.getElementById("status-message");

  if (!element) {
    return;
  }

  element.textContent = message;
  element.style.color =
    isError ? "#a30000" : "#555";
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\bwestern blotting\b/g, "western blot")
    .replace(/\bconfocal imaging\b/g, "confocal microscopy")
    .replace(/\bmammalian cell culture\b/g, "cell culture")
    .replace(/\bcell culture mammalian\b/g, "cell culture")
    .replace(/\bbiotech\b/g, "biotechnology")
    .replace(/\bpharma\b/g, "pharmaceutical")
    .replace(/\bpost baccalaureate\b/g, "postbac")
    .replace(/\bin person\b/g, "in-person")
    .replace(/\bfor credit\b/g, "for-credit")
    .replace(/\s+/g, " ")
    .trim();
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => splitList(item))
      .filter(Boolean);
  }

  if (value === null || value === undefined) {
    return [];
  }

  return String(value)
    .split(/[,;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function cleanSkill(value) {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/—.*/g, "")
    .trim();
}

function extractSkills(value) {
  if (!Array.isArray(value)) {
    return splitList(value).map(cleanSkill);
  }

  return value
    .map(item => {
      if (
        item &&
        typeof item === "object"
      ) {
        return cleanSkill(
          item.skill ||
          item.Skill ||
          item.name ||
          ""
        );
      }

      return cleanSkill(item);
    })
    .filter(Boolean);
}

function valuesMatch(candidateValue, labValue) {
  const candidateArray =
    Array.isArray(candidateValue)
      ? candidateValue
      : splitList(candidateValue);

  const labArray =
    Array.isArray(labValue)
      ? labValue
      : splitList(labValue);

  return candidateArray.some(candidateItem =>
    labArray.some(labItem => {
      const candidateText =
        normalizeText(candidateItem);

      const labText =
        normalizeText(labItem);

      if (!candidateText || !labText) {
        return false;
      }

      if (candidateText === labText) {
        return true;
      }

      // Prevent "R" from matching PCR or CRISPR.
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

function normalizeEducation(value) {
  const text = normalizeText(value);

  if (text.includes("freshman")) {
    return "Freshman";
  }

  if (text.includes("sophomore")) {
    return "Sophomore";
  }

  if (text.includes("junior")) {
    return "Junior";
  }

  if (text.includes("senior")) {
    return "Senior";
  }

  if (
    text.includes("postbac") ||
    text.includes("post bac")
  ) {
    return "Postbac";
  }

  if (
    text.includes("master") ||
    text === "ms"
  ) {
    return "MS";
  }

  if (
    text.includes("phd") ||
    text.includes("postdoctoral") ||
    text.includes("postdoc")
  ) {
    return "PhD";
  }

  return value;
}

function normalizeEducationOptions(value) {
  const items = splitList(value);
  const results = [];

  for (const item of items) {
    const text = normalizeText(item);

    if (text.includes("undergraduate")) {
      results.push(
        "Freshman",
        "Sophomore",
        "Junior",
        "Senior"
      );
      continue;
    }

    if (text.includes("graduate student")) {
      results.push("MS", "PhD");
      continue;
    }

    results.push(normalizeEducation(item));
  }

  return [...new Set(results.filter(Boolean))];
}

function normalizeHours(value) {
  const text = normalizeText(value);

  if (
    text.includes("less than 10") ||
    text.includes("under 10")
  ) {
    return "Less than 10 hours";
  }

  if (
    text.includes("20+") ||
    text.includes("20 plus") ||
    text.includes("full time") ||
    text.includes("more than 20")
  ) {
    return "Full-time";
  }

  if (
    text.includes("part time") ||
    text.includes("10 20") ||
    text.includes("10 15") ||
    text.includes("12 15") ||
    text.includes("8 12") ||
    text.includes("10–20")
  ) {
    return "Part-time";
  }

  return value;
}

function normalizeCompensation(value) {
  const text = normalizeText(value);

  if (
    text.includes("academic credit") ||
    text.includes("for-credit") ||
    text.includes("for credit")
  ) {
    return "For-credit";
  }

  if (text.includes("paid")) {
    return "Paid";
  }

  if (text.includes("volunteer")) {
    return "Volunteer";
  }

  return value;
}

function normalizeCompensationOptions(value) {
  const text = normalizeText(value);
  const results = [];

  if (text.includes("paid")) {
    results.push("Paid");
  }

  if (
    text.includes("for-credit") ||
    text.includes("academic credit")
  ) {
    results.push("For-credit");
  }

  if (text.includes("volunteer")) {
    results.push("Volunteer");
  }

  return results.length
    ? results
    : [normalizeCompensation(value)];
}

function normalizeRemote(value) {
  const text = normalizeText(value);

  if (text.includes("hybrid")) {
    return "Hybrid";
  }

  if (text.includes("remote")) {
    return "Remote";
  }

  if (
    text.includes("in-person") ||
    text.includes("in person")
  ) {
    return "In-person only";
  }

  return value;
}

function expandCareerTerms(value) {
  const text = normalizeText(value);
  const results = [value];

  if (text.includes("academic phd")) {
    results.push("Academic PhD");
  }

  if (text.includes("md/phd")) {
    results.push("MD/PhD");
  }

  if (text.includes("pharmaceutical")) {
    results.push("Pharmaceutical Industry");
  }

  if (text.includes("biotechnology")) {
    results.push("Biotechnology Industry");
  }

  if (text.includes("government")) {
    results.push("Government Research");
  }

  if (text.includes("public health")) {
    results.push("Public Health");
  }

  if (text.includes("clinical medicine")) {
    results.push(
      "Clinical Research",
      "Medical School"
    );
  }

  return [...new Set(results.filter(Boolean))];
}

function normalizeCandidate(raw) {
  return {
    Candidate_ID:
      raw.Candidate_ID || "USER-CANDIDATE",

    Candidate_Name:
      raw.Candidate_Name || "Candidate",

    Primary_Field_Interest:
      raw.Primary_Field_Interest || "",

    Sub_discipline_Interests:
      splitList(raw.Sub_discipline_Interests),

    Confirmed_Skills:
      extractSkills(raw.Confirmed_Skills),

    Career_Goal:
      expandCareerTerms(raw.Career_Goal),

    Education_Level:
      normalizeEducation(raw.Education_Level),

    Hours_Available:
      normalizeHours(raw.Hours_Available),

    Compensation_Need:
      normalizeCompensation(
        raw.Compensation_Need
      ),

    Remote_Preference:
      normalizeRemote(
        raw.Remote_Preference
      ),

    Research_Statement_FreeText:
      raw.Research_Statement_FreeText || ""
  };
}

function normalizeLab(raw) {
  const requiredSkills =
    splitList(raw.Required_Techniques);

  const preferredSkills =
    splitList(raw.Preferred_Techniques);

  return {
    Lab_ID:
      raw["Lab_ID (LAB-001 to LAB-005)"] ||
      raw.Lab_ID ||
      "",

    Lab_Name:
      raw.Lab_Name || "Unnamed Lab",

    Primary_Field:
      raw.Primary_Field || "",

    Sub_discipline:
      splitList(raw.Sub_disciplines),

    Required_Skills: [
      ...requiredSkills,
      ...preferredSkills
    ].map(cleanSkill),

    Career_Goal:
      expandCareerTerms(
        raw.Career_Pathways_Supported
      ),

    Hiree_Level:
      normalizeEducationOptions(
        raw.Hiree_Level_Sought
      ),

    Hours:
      normalizeHours(raw.Hours_Per_Week),

    Compensation:
      normalizeCompensationOptions(
        raw.Compensation
      ),

    Remote:
      normalizeRemote(raw.Remote_Option),

    Lab_Description_FreeText:
      raw.Lab_Description_FreeText || "",

    Lab_Aim:
      raw.Lab_Aim || "",

    Institution_Type:
      raw.Institution_Type || "",

    Lab_Size:
      raw.Lab_Size || "",

    Required_Techniques:
      raw.Required_Techniques || "",

    Preferred_Techniques:
      raw.Preferred_Techniques || "",

    Career_Pathways_Supported:
      raw.Career_Pathways_Supported || "",

    Hiree_Level_Sought:
      raw.Hiree_Level_Sought || "",

    Hours_Per_Week:
      raw.Hours_Per_Week || "",

    Compensation_Original:
      raw.Compensation || "",

    Remote_Option:
      raw.Remote_Option || ""
  };
}

function getInputValue(id) {
  const element = document.getElementById(id);

  return element
    ? element.value.trim()
    : "";
}

function buildCandidateFromForm() {
  return {
    Candidate_ID: "USER-CANDIDATE",

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
      expandCareerTerms(
        getInputValue("career-goal")
      ),

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

function percent(score, maximum) {
  if (!maximum) {
    return 0;
  }

  return (score / maximum) * 100;
}

function skillScore(
  candidateSkills,
  labSkills,
  weight
) {
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

  techniqueMax += 18;

  techniqueScore += skillScore(
    candidate.Confirmed_Skills,
    lab.Required_Skills,
    18
  );

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

async function getEmbedding(
  text,
  inputType = "search_document"
) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    return [];
  }

  const cacheKey =
    `${inputType}:${cleanText}`;

  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }

  if (!window.COHERE_API_KEY) {
    throw new Error(
      "Cohere API key is missing from scripts/config.js."
    );
  }

  const response = await fetch(
    "https://api.cohere.ai/v1/embed",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${window.COHERE_API_KEY}`,

        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        texts: [cleanText],
        model: "embed-english-light-v3.0",
        input_type: inputType
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      `Cohere request failed: ${response.status}`
    );
  }

  const embedding =
    data.embeddings?.[0];

  if (!Array.isArray(embedding)) {
    throw new Error(
      "Cohere did not return a valid embedding."
    );
  }

  embeddingCache.set(
    cacheKey,
    embedding
  );

  return embedding;
}

function cosineSimilarity(vectorA, vectorB) {
  if (
    !Array.isArray(vectorA) ||
    !Array.isArray(vectorB) ||
    vectorA.length === 0 ||
    vectorA.length !== vectorB.length
  ) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    magnitudeA += vectorA[i] ** 2;
    magnitudeB += vectorB[i] ** 2;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (!magnitudeA || !magnitudeB) {
    return 0;
  }

  return dotProduct /
    (magnitudeA * magnitudeB);
}

async function semanticScore(
  candidateStatement,
  labDescription
) {
  if (
    !candidateStatement ||
    !labDescription
  ) {
    return 0;
  }

  const [
    candidateEmbedding,
    labEmbedding
  ] = await Promise.all([
    getEmbedding(
      candidateStatement,
      "search_query"
    ),

    getEmbedding(
      labDescription,
      "search_document"
    )
  ]);

  const similarity =
    cosineSimilarity(
      candidateEmbedding,
      labEmbedding
    );

  return Math.max(
    0,
    Math.min(1, similarity)
  );
}

async function precomputeLabEmbeddings(labs) {
  for (const lab of labs) {
    if (lab.Lab_Description_FreeText) {
      await getEmbedding(
        lab.Lab_Description_FreeText,
        "search_document"
      );
    }
  }
}

function getSemanticReason(semanticPercent) {
  if (semanticPercent >= 70) {
    return (
      "High: your research statement is closely " +
      "related to this lab's research."
    );
  }

  if (semanticPercent >= 40) {
    return (
      "Moderate: your interests overlap with " +
      "some parts of this lab's research."
    );
  }

  return (
    "Low: your research statement and this lab " +
    "focus on different research areas."
  );
}

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

    labProfile:
      lab,

    ...rule,

    semanticPercent,

    semanticReason:
      getSemanticReason(semanticPercent),

    combinedPercent
  };
}

async function handleCandidateSubmit(event) {
  event.preventDefault();

  const submitButton =
    document.getElementById("submit-button");

  const candidate =
    buildCandidateFromForm();

  if (!labsData.length) {
    setStatus(
      "Lab data has not loaded.",
      true
    );
    return;
  }

  if (!window.COHERE_API_KEY) {
    setStatus(
      "Cohere API key is missing.",
      true
    );
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent =
      "Calculating Matches...";
  }

  setStatus(
    "Comparing your profile with all laboratories..."
  );

  try {
    const results = [];

    for (const lab of labsData) {
      const result =
        await scoreCandidate(candidate, lab);

      results.push(result);
    }

    results.sort(
      (a, b) =>
        b.combinedPercent -
        a.combinedPercent
    );

    sessionStorage.setItem(
      "labMatchResults",
      JSON.stringify(results)
    );

    sessionStorage.setItem(
      "submittedCandidate",
      JSON.stringify(candidate)
    );

    console.table(
      results.map(result => ({
        Lab: result.Lab_ID,
        "Rule %":
          result.rulePercent.toFixed(1),
        "AI %":
          result.semanticPercent.toFixed(1),
        "Combined %":
          result.combinedPercent.toFixed(1)
      }))
    );

    window.location.href =
      "results.html";
  } catch (error) {
    console.error(
      "Match calculation failed:",
      error
    );

    setStatus(
      "The matches could not be calculated. Check the Console.",
      true
    );

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        "Find My Lab Matches";
    }
  }
}

/*
  Console test functions
*/

async function runFullCandidateTest() {
  const summary = [];

  for (const candidate of candidatesData) {
    const candidateResults = [];

    for (const lab of labsData) {
      candidateResults.push(
        await scoreCandidate(candidate, lab)
      );
    }

    candidateResults.sort(
      (a, b) =>
        b.combinedPercent -
        a.combinedPercent
    );

    const top = candidateResults[0];

    summary.push({
      Candidate: candidate.Candidate_ID,
      "Top Match Lab": top.Lab_ID,
      "Rule %":
        `${top.rulePercent.toFixed(1)}%`,
      "AI %":
        `${top.semanticPercent.toFixed(1)}%`,
      "Combined %":
        `${top.combinedPercent.toFixed(1)}%`
    });
  }

  console.table(summary);

  return summary;
}

async function runFullMatrixTest() {
  const allResults = [];

  console.log(
    `Starting ${candidatesData.length} × ` +
    `${labsData.length} matrix test.`
  );

  for (const candidate of candidatesData) {
    console.log(
      `Testing ${candidate.Candidate_ID}`
    );

    for (const lab of labsData) {
      const result =
        await scoreCandidate(candidate, lab);

      allResults.push({
        Candidate:
          result.Candidate_ID,

        CandidateName:
          result.Candidate_Name,

        Lab:
          result.Lab_ID,

        LabName:
          result.Lab_Name,

        rulePercent:
          result.rulePercent,

        semanticPercent:
          result.semanticPercent,

        combinedPercent:
          result.combinedPercent
      });
    }
  }

  const candidateTopMatches =
    candidatesData.map(candidate => {
      const matches = allResults
        .filter(
          result =>
            result.Candidate ===
            candidate.Candidate_ID
        )
        .sort(
          (a, b) =>
            b.combinedPercent -
            a.combinedPercent
        );

      const top = matches[0];

      return {
        Candidate:
          candidate.Candidate_ID,

        "Top Match Lab":
          top?.Lab || "No result",

        "Rule %":
          top
            ? `${top.rulePercent.toFixed(1)}%`
            : "N/A",

        "AI %":
          top
            ? `${top.semanticPercent.toFixed(1)}%`
            : "N/A",

        "Combined %":
          top
            ? `${top.combinedPercent.toFixed(1)}%`
            : "N/A"
      };
    });

  const labTopCandidates =
    labsData.map(lab => {
      const matches = allResults
        .filter(
          result =>
            result.Lab === lab.Lab_ID
        )
        .sort(
          (a, b) =>
            b.combinedPercent -
            a.combinedPercent
        );

      const top = matches[0];

      return {
        Lab: lab.Lab_ID,

        "Top Candidate":
          top?.Candidate || "No result",

        "Rule %":
          top
            ? `${top.rulePercent.toFixed(1)}%`
            : "N/A",

        "AI %":
          top
            ? `${top.semanticPercent.toFixed(1)}%`
            : "N/A",

        "Combined %":
          top
            ? `${top.combinedPercent.toFixed(1)}%`
            : "N/A"
      };
    });

  console.log(
    `Completed ${allResults.length} combinations.`
  );

  console.log(
    "TOP LAB FOR EACH CANDIDATE"
  );

  console.table(candidateTopMatches);

  console.log(
    "TOP CANDIDATE FOR EACH LAB"
  );

  console.table(labTopCandidates);

  window.fullMatrixTestResults = {
    allResults,
    candidateTopMatches,
    labTopCandidates
  };

  return window.fullMatrixTestResults;
}

window.scoreCandidate =
  scoreCandidate;

window.runFullCandidateTest =
  runFullCandidateTest;

window.runFullMatrixTest =
  runFullMatrixTest;

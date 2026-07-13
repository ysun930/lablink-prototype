// Import AI semantic scoring and lab embedding precomputation functions
const { semanticScore, precomputeLabEmbeddings } = require("./embedding");

// Stop the program if Cohere API key is missing
if (!process.env.COHERE_API_KEY) {
  console.error("Missing COHERE_API_KEY. Run: export COHERE_API_KEY='your-key'");
  process.exit(1);
}

// Sample candidate data used for testing
const candidates = {
  "CAND-001": {
    Primary_Field_Interest: "Neuroscience",
    Sub_discipline_Interests: ["Molecular & Cellular Neuroscience", "Synapses & Neural Circuits"],
    Confirmed_Skills: ["PCR", "Western Blot", "Cell Culture", "Confocal Microscopy"],
    Career_Goal: "Academic PhD in basic science",
    Education_Level: "Junior",
    Hours_Available: "Part-time",
    Compensation_Need: "For-credit",
    Remote_Preference: "In-person only",
    Research_Statement_FreeText:
      "I am fascinated by neural circuits and neurodevelopmental disorders. I want to use PCR, western blot, cell culture, and confocal microscopy in a wet-lab neuroscience setting."
  },

  "CAND-002": {
    Primary_Field_Interest: "Computational Biology",
    Sub_discipline_Interests: ["Bioinformatics", "Machine Learning"],
    Confirmed_Skills: ["Python", "R", "pandas", "BLAST", "scikit-learn"],
    Career_Goal: "Pharma or biotech industry",
    Education_Level: "Junior",
    Hours_Available: "Part-time",
    Compensation_Need: "Paid",
    Remote_Preference: "Remote or hybrid",
    Research_Statement_FreeText:
      "I am interested in computational biology, Python, R, machine learning, BLAST, and analyzing large biological datasets for biotech applications."
  },

  "CAND-003": {
    Primary_Field_Interest: "Oncology / Cancer Biology",
    Sub_discipline_Interests: [
      "Translational & Clinical Cancer Sciences",
      "Cancer Genetics"
    ],
    Confirmed_Skills: [
      "Flow Cytometry",
      "ELISA",
      "CRISPR-Cas9",
      "RT-PCR"
    ],
    Career_Goal: "MD/PhD",
    Education_Level: "Postbac",
    Hours_Available: "Full-time",
    Compensation_Need: "Paid",
    Remote_Preference: "In-person only",
    Research_Statement_FreeText:
      "I want to understand how tumors evade the immune system, which is what pulled me toward translational cancer research after graduation. I've run flow cytometry, ELISA, and CRISPR-Cas9 knockouts in a cancer immunology lab for the past two years, and I'm now looking for a lab connected to clinical cancer research as I apply to MD/PhD programs."
  }
};

// Sample lab data used for testing
const labs = {
  "LAB-001": {
    Primary_Field: "Neuroscience",
    Sub_discipline: ["Molecular & Cellular Neuroscience", "Neurodevelopment", "Synapses & Neural Circuits"],
    Required_Skills: ["PCR", "Western Blot", "Cell Culture", "Confocal Microscopy", "Immunofluorescence", "Flow Cytometry", "CRISPR-Cas9"],
    Career_Goal: "Academic PhD in basic science",
    Hiree_Level: "Junior",
    Hours: "Part-time",
    Compensation: "For-credit",
    Remote: "In-person only",
    Lab_Description_FreeText:
      "We investigate how neuronal signaling contributes to neurodevelopment and neurodegenerative disease using cell culture, molecular biology, PCR, western blotting, confocal imaging, and data analysis."
  },

  "LAB-002": {
    Primary_Field: "Computational Biology",
    Sub_discipline: ["Bioinformatics", "Machine Learning"],
    Required_Skills: ["Python", "R", "pandas", "BLAST", "scikit-learn"],
    Career_Goal: "Pharma or biotech industry",
    Hiree_Level: "Junior",
    Hours: "Part-time",
    Compensation: "Paid",
    Remote: "Remote or hybrid",
    Lab_Description_FreeText:
      "This computational biology lab uses Python, R, pandas, BLAST, scikit-learn, and machine learning to analyze biological datasets for biotech and pharmaceutical research."
  },

  "LAB-003": {
    Primary_Field: "Oncology / Cancer Biology",
    Sub_discipline: [
      "Tumor Microenvironment",
      "Cancer Genetics",
      "Translational & Clinical Cancer Sciences"
    ],
    Required_Skills: [
      "Flow Cytometry",
      "ELISA",
      "CRISPR-Cas9",
      "RT-PCR",
      "RNA-seq",
      "Immunoprecipitation",
      "Confocal Microscopy"
    ],
    Career_Goal: "MD/PhD",
    Hiree_Level: ["Postbac", "MS", "PhD"],
    Hours: "Full-time",
    Compensation: "Paid",
    Remote: "In-person only",
    Lab_Description_FreeText:
      "We study how the tumor microenvironment and genetic alterations influence cancer progression and response to therapy. Researchers work with flow cytometry, CRISPR gene editing, molecular biology techniques, and translational models to develop new therapeutic strategies."
  }
};

// Five test pairs for rule + AI combined scoring
const testPairs = [
  ["CAND-001", "LAB-001"],
  ["CAND-002", "LAB-001"],
  ["CAND-002", "LAB-002"],
  ["CAND-001", "LAB-002"],
  ["CAND-003", "LAB-003"]
];

// Standardizes text for easier matching
function normalize(value) {
  return String(value).toLowerCase().trim();
}

// Checks whether candidate value and lab value match
function valuesMatch(candidateValue, labValue) {
  const candidateArray = Array.isArray(candidateValue) ? candidateValue : [candidateValue];
  const labArray = Array.isArray(labValue) ? labValue : [labValue];

  return candidateArray.some(c =>
    labArray.some(l =>
      normalize(c) === normalize(l) ||
      normalize(c).includes(normalize(l)) ||
      normalize(l).includes(normalize(c))
    )
  );
}

// Calculates partial technique score based on matched lab skills
function skillScore(candidateSkills, labSkills, weight) {
  let matchedCount = 0;

  for (const labSkill of labSkills) {
    if (candidateSkills.some(skill => valuesMatch(skill, labSkill))) {
      matchedCount++;
    }
  }

  return weight * (matchedCount / labSkills.length);
}

// Converts score into percentage
function percent(score, max) {
  if (max === 0) {
    return 0;
  }

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

  // Adds points for field matches
  function addFieldMatch(candidateValue, labValue, weight) {
    fieldMax += weight;
    if (valuesMatch(candidateValue, labValue)) {
      fieldScore += weight;
    }
  }

  // Adds points for goal/logistics matches
  function addGoalMatch(candidateValue, labValue, weight) {
    goalMax += weight;
    if (valuesMatch(candidateValue, labValue)) {
      goalScore += weight;
    }
  }

  // Field scoring: compares research field and sub-discipline
  addFieldMatch(candidate.Primary_Field_Interest, lab.Primary_Field, 3);
  addFieldMatch(candidate.Sub_discipline_Interests, lab.Sub_discipline, 2);

  // Technique scoring: compares candidate skills with lab required skills
  techniqueMax += 18;
  techniqueScore += skillScore(candidate.Confirmed_Skills, lab.Required_Skills, 18);

  // Goal scoring: compares career goal, education level, time, pay, and remote preference
  addGoalMatch(candidate.Career_Goal, lab.Career_Goal, 3);
  addGoalMatch(candidate.Education_Level, lab.Hiree_Level, 3);
  addGoalMatch(candidate.Hours_Available, lab.Hours, 3);
  addGoalMatch(candidate.Compensation_Need, lab.Compensation, 2);
  addGoalMatch(candidate.Remote_Preference, lab.Remote, 3);

  // Total rule-based score
  const ruleScore = fieldScore + techniqueScore + goalScore;
  const ruleMax = fieldMax + techniqueMax + goalMax;

  return {
    fieldScore: fieldScore,
    fieldMax: fieldMax,
    fieldPercent: percent(fieldScore, fieldMax),

    techniqueScore: techniqueScore,
    techniqueMax: techniqueMax,
    techniquePercent: percent(techniqueScore, techniqueMax),

    goalScore: goalScore,
    goalMax: goalMax,
    goalPercent: percent(goalScore, goalMax),

    ruleScore: ruleScore,
    ruleMax: ruleMax,
    rulePercent: percent(ruleScore, ruleMax)
  };
}

// Runs combined scoring on all test pairs
async function runCombinedTests() {
  console.log("COMBINED MODE RESULTS");
  console.log("=====================");

  // Precompute lab embeddings once to reduce repeated Cohere API calls
  await precomputeLabEmbeddings(labs);

  for (const [candId, labId] of testPairs) {
    const candidate = candidates[candId];
    const lab = labs[labId];

    // Calculate rule-based score
    const rule = calculateRuleScores(candidate, lab);

    // Calculate AI semantic similarity score
    const semantic = await semanticScore(
      candidate.Research_Statement_FreeText,
      lab.Lab_Description_FreeText
    );

    const semanticPercent = semantic * 100;

    // Final score: 80% rule-based + 20% AI semantic
    const combinedPercent = rule.rulePercent * 0.8 + semanticPercent * 0.2;

    // Print detailed scoring results
    console.log(`${candId} vs ${labId}`);

    console.log(`Field Score: ${rule.fieldScore.toFixed(1)} / ${rule.fieldMax}`);
    console.log(`Technique Score: ${rule.techniqueScore.toFixed(1)} / ${rule.techniqueMax}`);
    console.log(`Goal Score: ${rule.goalScore.toFixed(1)} / ${rule.goalMax}`);
    console.log(`Goal Percent: ${rule.goalPercent.toFixed(1)}%`);

    console.log(`Rule Percent: ${rule.rulePercent.toFixed(1)}%`);
    console.log(`Semantic Percent: ${semanticPercent.toFixed(1)}%`);
    console.log(`Combined Percent: ${combinedPercent.toFixed(1)}%`);
    console.log("----------------------------");
  }
}

// Start the test script
runCombinedTests();

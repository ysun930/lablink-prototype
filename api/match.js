const {
  createClient
} = require("@supabase/supabase-js");

/*
==================================================
GENERAL HELPERS
==================================================
*/

function parseBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  return req.body || {};
}

function toList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(toList)
      .filter(Boolean);
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }

  return String(value)
    .split(/[,;|\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[–—-]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9+.#\s]/g, " ")
    .replace(
      /\bwestern blotting\b/g,
      "western blot"
    )
    .replace(
      /\bmammalian cell culture\b/g,
      "cell culture"
    )
    .replace(
      /\bconfocal imaging\b/g,
      "confocal microscopy"
    )
    .replace(
      /\bacademic credit\b/g,
      "credit"
    )
    .replace(
      /\bfor credit\b/g,
      "credit"
    )
    .replace(
      /\bin person\b/g,
      "in person"
    )
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ];
}

function getBodyValue(
  body,
  aliases,
  fallback = ""
) {
  for (const alias of aliases) {
    if (
      body[alias] !== undefined &&
      body[alias] !== null &&
      body[alias] !== ""
    ) {
      return body[alias];
    }
  }

  return fallback;
}

function normalizeCandidate(body) {
  return {
    candidateName: getBodyValue(
      body,
      [
        "candidateName",
        "candidate_name",
        "name"
      ]
    ),

    primaryField: getBodyValue(
      body,
      [
        "primaryField",
        "primary_field",
        "field"
      ]
    ),

    subDisciplines: toList(
      getBodyValue(
        body,
        [
          "subDisciplines",
          "sub_disciplines",
          "subDiscipline"
        ],
        []
      )
    ),

    skills: toList(
      getBodyValue(
        body,
        [
          "skills",
          "techniques",
          "researchSkills",
          "research_skills"
        ],
        []
      )
    ),

    careerGoal: getBodyValue(
      body,
      [
        "careerGoal",
        "career_goal"
      ]
    ),

    educationLevel: getBodyValue(
      body,
      [
        "educationLevel",
        "education_level"
      ]
    ),

    hoursAvailable: getBodyValue(
      body,
      [
        "hoursAvailable",
        "hours_available",
        "hours"
      ]
    ),

    compensationPreference:
      getBodyValue(
        body,
        [
          "compensationPreference",
          "compensation_preference",
          "compensationNeed",
          "compensation_need",
          "compensation"
        ]
      ),

    workFormatPreference:
      getBodyValue(
        body,
        [
          "workFormatPreference",
          "work_format_preference",
          "remotePreference",
          "remote_preference",
          "workFormat"
        ]
      ),

    researchStatement:
      getBodyValue(
        body,
        [
          "researchStatement",
          "research_statement",
          "statement",
          "description"
        ]
      )
  };
}

/*
==================================================
VALUE MATCHING
==================================================
*/

function itemMatches(left, right) {
  const leftText = normalize(left);
  const rightText = normalize(right);

  if (
    !leftText ||
    !rightText
  ) {
    return false;
  }

  if (leftText === rightText) {
    return true;
  }

  /*
    Prevent short values such as R
    from matching PCR or CRISPR.
  */
  if (
    leftText.length < 4 ||
    rightText.length < 4
  ) {
    return false;
  }

  return (
    leftText.includes(rightText) ||
    rightText.includes(leftText)
  );
}

function valuesMatch(left, right) {
  const leftItems = toList(left);
  const rightItems = toList(right);

  return leftItems.some(leftItem =>
    rightItems.some(rightItem =>
      itemMatches(
        leftItem,
        rightItem
      )
    )
  );
}

function getMatches(left, right) {
  const leftItems = unique(
    toList(left)
      .map(item => item.trim())
      .filter(Boolean)
  );

  const rightItems = unique(
    toList(right)
      .map(item => item.trim())
      .filter(Boolean)
  );

  return rightItems.filter(rightItem =>
    leftItems.some(leftItem =>
      itemMatches(
        leftItem,
        rightItem
      )
    )
  );
}

/*
==================================================
FIELD MATCHING
==================================================
*/

const FIELD_GROUPS = [
  [
    "molecular biology",
    "cell biology",
    "biochemistry"
  ],

  [
    "genetics",
    "genomics",
    "genetics and genomics",
    "computational biology",
    "bioinformatics"
  ],

  [
    "neuroscience",
    "neurobiology",
    "cognitive neuroscience"
  ],

  [
    "immunology",
    "microbiology",
    "infectious disease"
  ],

  [
    "oncology",
    "cancer biology",
    "tumor biology"
  ],

  [
    "public health",
    "epidemiology",
    "global health"
  ],

  [
    "pharmacology",
    "toxicology",
    "drug discovery"
  ],

  [
    "biomedical engineering",
    "bioengineering"
  ]
];

function fieldsRelated(left, right) {
  const leftField = normalize(left);
  const rightField = normalize(right);

  if (
    !leftField ||
    !rightField
  ) {
    return false;
  }

  if (
    leftField === rightField ||
    leftField.includes(rightField) ||
    rightField.includes(leftField)
  ) {
    return true;
  }

  return FIELD_GROUPS.some(group => {
    const normalizedGroup =
      group.map(normalize);

    const containsLeft =
      normalizedGroup.some(field =>
        leftField.includes(field) ||
        field.includes(leftField)
      );

    const containsRight =
      normalizedGroup.some(field =>
        rightField.includes(field) ||
        field.includes(rightField)
      );

    return (
      containsLeft &&
      containsRight
    );
  });
}

/*
==================================================
EDUCATION MATCHING
==================================================
*/

function educationMatch(
  candidateEducation,
  labEducation
) {
  const candidate =
    normalize(candidateEducation);

  const labLevels =
    toList(labEducation)
      .map(normalize);

  if (
    !candidate ||
    labLevels.length === 0
  ) {
    return false;
  }

  if (
    labLevels.some(level =>
      level.includes("any") ||
      level.includes("all")
    )
  ) {
    return true;
  }

  if (
    labLevels.some(level =>
      level.includes(candidate) ||
      candidate.includes(level)
    )
  ) {
    return true;
  }

  const undergraduateLevels = [
    "high school",
    "freshman",
    "sophomore",
    "junior",
    "senior",
    "undergraduate"
  ];

  const graduateLevels = [
    "master",
    "masters",
    "phd",
    "doctoral",
    "graduate"
  ];

  const candidateIsUndergraduate =
    undergraduateLevels.some(level =>
      candidate.includes(level)
    );

  if (candidateIsUndergraduate) {
    return labLevels.some(level =>
      undergraduateLevels.some(
        undergraduate =>
          level.includes(undergraduate)
      )
    );
  }

  const candidateIsGraduate =
    graduateLevels.some(level =>
      candidate.includes(level)
    );

  if (candidateIsGraduate) {
    return labLevels.some(level =>
      graduateLevels.some(
        graduate =>
          level.includes(graduate)
      )
    );
  }

  return false;
}

/*
==================================================
HOURS MATCHING
==================================================
*/

function parseHours(value) {
  const text = normalize(value);

  const numbers =
    text.match(/\d+/g)?.map(Number) ||
    [];

  if (
    text.includes("full time") ||
    text.includes("20+")
  ) {
    return {
      min: 20,
      max: Infinity
    };
  }

  if (
    text.includes("less than") ||
    text.includes("under")
  ) {
    return {
      min: 0,
      max: numbers[0] || 10
    };
  }

  if (numbers.length >= 2) {
    return {
      min: numbers[0],
      max: numbers[1]
    };
  }

  if (numbers.length === 1) {
    return {
      min: numbers[0],
      max: numbers[0]
    };
  }

  if (text.includes("part time")) {
    return {
      min: 10,
      max: 20
    };
  }

  return null;
}

function hoursMatch(
  candidateHours,
  labHours
) {
  const candidate =
    parseHours(candidateHours);

  const lab =
    parseHours(labHours);

  if (
    !candidate ||
    !lab
  ) {
    return valuesMatch(
      candidateHours,
      labHours
    );
  }

  return (
    candidate.max >= lab.min &&
    lab.max >= candidate.min
  );
}

/*
==================================================
WORK FORMAT MATCHING
==================================================
*/

function workFormatMatch(
  candidateFormat,
  labFormat
) {
  const candidate =
    normalize(candidateFormat);

  const lab =
    normalize(labFormat);

  if (
    !candidate ||
    !lab
  ) {
    return false;
  }

  if (
    candidate.includes("flexible") ||
    lab.includes("flexible")
  ) {
    return true;
  }

  if (
    candidate.includes("hybrid") &&
    (
      lab.includes("hybrid") ||
      lab.includes("remote") ||
      lab.includes("in person")
    )
  ) {
    return true;
  }

  return valuesMatch(
    candidate,
    lab
  );
}

/*
==================================================
RULE-BASED SCORE
==================================================
*/

function calculateRuleScore(
  candidate,
  lab
) {
  let fieldScore = 0;
  let techniqueScore = 0;
  let goalScore = 0;

  const reasons = [];

  /*
    FIELD SCORE: 5 points
  */

  const candidateField =
    normalize(candidate.primaryField);

  const labField =
    normalize(lab.primary_field);

  if (
    candidateField &&
    candidateField === labField
  ) {
    fieldScore += 3;

    reasons.push(
      `Your primary field exactly matches ${lab.primary_field}.`
    );
  } else if (
    fieldsRelated(
      candidate.primaryField,
      lab.primary_field
    )
  ) {
    fieldScore += 1.5;

    reasons.push(
      `Your field is closely related to ${lab.primary_field}.`
    );
  }

  const matchedSubDisciplines =
    getMatches(
      candidate.subDisciplines,
      lab.sub_disciplines
    );

  if (
    matchedSubDisciplines.length > 0
  ) {
    fieldScore += 2;

    reasons.push(
      `Matching sub-disciplines: ${matchedSubDisciplines.join(", ")}.`
    );
  }

  /*
    TECHNIQUE SCORE: 18 points
  */

  const labTechniques = unique([
    ...toList(
      lab.required_techniques
    ),

    ...toList(
      lab.preferred_techniques
    )
  ]);

  const matchedTechniques =
    getMatches(
      candidate.skills,
      labTechniques
    );

  if (labTechniques.length > 0) {
    techniqueScore =
      (
        matchedTechniques.length /
        labTechniques.length
      ) * 18;
  }

  if (
    matchedTechniques.length > 0
  ) {
    reasons.push(
      `Matching skills and techniques: ${matchedTechniques.join(", ")}.`
    );
  }

  /*
    GOALS AND LOGISTICS: 14 points
  */

  if (
    valuesMatch(
      candidate.careerGoal,
      lab.career_pathways
    )
  ) {
    goalScore += 3;

    reasons.push(
      "Your career goal matches the pathways supported by this lab."
    );
  }

  if (
    educationMatch(
      candidate.educationLevel,
      lab.hiree_level
    )
  ) {
    goalScore += 3;

    reasons.push(
      "Your education level matches the lab's preferred applicant level."
    );
  }

  if (
    hoursMatch(
      candidate.hoursAvailable,
      lab.hours_per_week
    )
  ) {
    goalScore += 3;

    reasons.push(
      "Your weekly availability matches the lab's time expectations."
    );
  }

  if (
    valuesMatch(
      candidate.compensationPreference,
      lab.compensation
    )
  ) {
    goalScore += 2;

    reasons.push(
      "Your compensation preference matches what the lab offers."
    );
  }

  if (
    workFormatMatch(
      candidate.workFormatPreference,
      lab.remote_option
    )
  ) {
    goalScore += 3;

    reasons.push(
      "Your preferred work format matches the lab's work format."
    );
  }

  const rawScore =
    fieldScore +
    techniqueScore +
    goalScore;

  const rulePercent =
    Math.max(
      0,
      Math.min(
        100,
        rawScore / 37 * 100
      )
    );

  if (reasons.length === 0) {
    reasons.push(
      "This lab has limited direct rule-based overlap with the submitted profile."
    );
  }

  return {
    fieldScore:
      Number(fieldScore.toFixed(2)),

    fieldMax: 5,

    fieldPercent:
      Number(
        (
          fieldScore /
          5 *
          100
        ).toFixed(1)
      ),

    techniqueScore:
      Number(
        techniqueScore.toFixed(2)
      ),

    techniqueMax: 18,

    techniquePercent:
      Number(
        (
          techniqueScore /
          18 *
          100
        ).toFixed(1)
      ),

    goalScore:
      Number(goalScore.toFixed(2)),

    goalMax: 14,

    goalPercent:
      Number(
        (
          goalScore /
          14 *
          100
        ).toFixed(1)
      ),

    rawScore:
      Number(rawScore.toFixed(2)),

    ruleMax: 37,

    rulePercent:
      Number(rulePercent.toFixed(1)),

    matchedTechniques,

    matchedSubDisciplines,

    reasons
  };
}

/*
==================================================
COHERE AI SEMANTIC SCORE
==================================================
*/

function buildCandidateText(candidate) {
  return [
    candidate.primaryField,

    ...toList(
      candidate.subDisciplines
    ),

    ...toList(
      candidate.skills
    ),

    candidate.careerGoal,
    candidate.educationLevel,
    candidate.researchStatement
  ]
    .filter(Boolean)
    .join(". ");
}

function buildLabText(lab) {
  return [
    lab.lab_name,
    lab.primary_field,

    ...toList(
      lab.sub_disciplines
    ),

    ...toList(
      lab.required_techniques
    ),

    ...toList(
      lab.preferred_techniques
    ),

    lab.lab_aim,

    ...toList(
      lab.career_pathways
    ),

    lab.description
  ]
    .filter(Boolean)
    .join(". ");
}

async function createEmbeddings(
  texts,
  inputType
) {
  const cohereKey =
    String(
      process.env.COHERE_API_KEY ||
      ""
    ).trim();

  if (!cohereKey) {
    throw new Error(
      "COHERE_API_KEY is missing."
    );
  }

  const response = await fetch(
    "https://api.cohere.com/v2/embed",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${cohereKey}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        model: "embed-v4.0",

        texts,

        input_type: inputType,

        embedding_types: [
          "float"
        ],

        output_dimension: 1024,

        truncate: "END"
      })
    }
  );

  const result =
    await response.json();

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.error?.message ||
      `Cohere request failed with status ${response.status}.`
    );
  }

  const embeddings =
    result.embeddings?.float;

  if (!Array.isArray(embeddings)) {
    throw new Error(
      "Cohere returned no float embeddings."
    );
  }

  return embeddings;
}

function cosineSimilarity(
  vectorA,
  vectorB
) {
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

  for (
    let index = 0;
    index < vectorA.length;
    index++
  ) {
    dotProduct +=
      vectorA[index] *
      vectorB[index];

    magnitudeA +=
      vectorA[index] ** 2;

    magnitudeB +=
      vectorB[index] ** 2;
  }

  magnitudeA =
    Math.sqrt(magnitudeA);

  magnitudeB =
    Math.sqrt(magnitudeB);

  if (
    magnitudeA === 0 ||
    magnitudeB === 0
  ) {
    return 0;
  }

  return (
    dotProduct /
    (
      magnitudeA *
      magnitudeB
    )
  );
}

/*
==================================================
API HANDLER
==================================================
*/

module.exports = async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error:
        "Only POST requests are allowed."
    });
  }

  try {
    const supabaseUrl =
      String(
        process.env.SUPABASE_URL ||
        ""
      ).trim();

    const serviceKey =
      String(
        process.env.SUPABASE_SERVICE_KEY ||
        ""
      ).trim();

    if (
      !supabaseUrl ||
      !serviceKey
    ) {
      return res.status(500).json({
        error:
          "SUPABASE_URL or SUPABASE_SERVICE_KEY is missing."
      });
    }

    const requestBody =
      parseBody(req);

    const candidate =
      normalizeCandidate(requestBody);

    if (
      !candidate.candidateName ||
      !candidate.primaryField
    ) {
      return res.status(400).json({
        error:
          "Candidate name and primary field are required."
      });
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    /*
      Read every lab from Supabase.
    */

    const {
      data: labs,
      error: labsError
    } = await supabase
      .from("labs")
      .select("*");

    if (labsError) {
      console.error(
        "Supabase labs error:",
        labsError
      );

      return res.status(500).json({
        error: labsError.message
      });
    }

    if (
      !Array.isArray(labs) ||
      labs.length === 0
    ) {
      return res.status(404).json({
        error:
          "No labs were found in the Supabase labs table."
      });
    }

    /*
      Calculate the rule-based score.
    */

    const ruleResults =
      labs.map(lab => ({
        lab,

        rule:
          calculateRuleScore(
            candidate,
            lab
          )
      }));

    /*
      Calculate AI semantic scores.
    */

    let aiAvailable = false;

    let semanticScores =
      labs.map(() => 0);

    try {
      const candidateText =
        buildCandidateText(
          candidate
        );

      const labTexts =
        labs.map(buildLabText);

      if (candidateText.trim()) {
        const candidateEmbeddings =
          await createEmbeddings(
            [candidateText],
            "search_query"
          );

        const labEmbeddings =
          await createEmbeddings(
            labTexts,
            "search_document"
          );

        const candidateVector =
          candidateEmbeddings[0];

        semanticScores =
          labEmbeddings.map(
            labVector => {
              const similarity =
                cosineSimilarity(
                  candidateVector,
                  labVector
                );

              return Number(
                Math.max(
                  0,
                  Math.min(
                    100,
                    similarity * 100
                  )
                ).toFixed(1)
              );
            }
          );

        aiAvailable = true;
      }
    } catch (cohereError) {
      console.warn(
        "Cohere AI score unavailable:",
        cohereError.message
      );
    }

    /*
      Build final results.
    */

    const results =
      ruleResults.map(
        (item, index) => {
          const semanticPercent =
            semanticScores[index] || 0;

          const combinedPercent =
            aiAvailable
              ? (
                  item.rule.rulePercent *
                    0.8 +
                  semanticPercent *
                    0.2
                )
              : item.rule.rulePercent;

          const reasons = [
            ...item.rule.reasons
          ];

          if (aiAvailable) {
            if (semanticPercent >= 70) {
              reasons.push(
                "The candidate's research statement has strong semantic similarity to this lab's research."
              );
            } else if (
              semanticPercent >= 40
            ) {
              reasons.push(
                "The candidate's research statement has moderate semantic similarity to this lab's research."
              );
            } else {
              reasons.push(
                "The candidate's research statement has limited semantic similarity to this lab's research."
              );
            }
          } else {
            reasons.push(
              "The AI semantic score was unavailable, so the combined score uses the rule-based score."
            );
          }

          /*
            Do not send stored vectors
            back to the browser.
          */

          const {
            description_embedding,
            ...safeLabProfile
          } = item.lab;

          return {
            labId:
              item.lab.id,

            labName:
              item.lab.lab_name,

            labProfile:
              safeLabProfile,

            fieldScore:
              item.rule.fieldScore,

            fieldMax:
              item.rule.fieldMax,

            fieldPercent:
              item.rule.fieldPercent,

            techniqueScore:
              item.rule.techniqueScore,

            techniqueMax:
              item.rule.techniqueMax,

            techniquePercent:
              item.rule.techniquePercent,

            goalScore:
              item.rule.goalScore,

            goalMax:
              item.rule.goalMax,

            goalPercent:
              item.rule.goalPercent,

            ruleScore:
              item.rule.rawScore,

            ruleMax:
              item.rule.ruleMax,

            rulePercent:
              item.rule.rulePercent,

            semanticPercent,

            combinedPercent:
              Number(
                combinedPercent.toFixed(1)
              ),

            aiAvailable,

            matchedTechniques:
              item.rule.matchedTechniques,

            matchedSubDisciplines:
              item.rule
                .matchedSubDisciplines,

            whyItMatches:
              reasons
          };
        }
      );

    /*
      Highest Combined Score first.
    */

    results.sort(
      (first, second) =>
        second.combinedPercent -
        first.combinedPercent
    );

    return res.status(200).json({
      success: true,

      candidate: {
        candidateName:
          candidate.candidateName,

        primaryField:
          candidate.primaryField
      },

      totalLabs:
        results.length,

      aiAvailable,

      results
    });
  } catch (error) {
    console.error(
      "Match API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Lab matching failed."
    });
  }
};
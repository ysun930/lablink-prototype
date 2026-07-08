const { semanticScore } = require("./embedding");

function normalize(value) {
  return String(value).toLowerCase().trim();
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

function valuesMatch(candidateValue, labValue) {
  if (isMissing(candidateValue) || isMissing(labValue)) {
    return false;
  }

  const candidateArray = Array.isArray(candidateValue) ? candidateValue : [candidateValue];
  const labArray = Array.isArray(labValue) ? labValue : [labValue];

  return candidateArray.some(candidateItem =>
    labArray.some(labItem =>
      normalize(candidateItem) === normalize(labItem) ||
      normalize(candidateItem).includes(normalize(labItem)) ||
      normalize(labItem).includes(normalize(candidateItem))
    )
  );
}

// This function decides whether each matching pair belongs to
// Technique scoring, Field scoring, Goal scoring, or Other scoring.
function getScoringComponent(aVariable, bVariable) {
  const variables = `${aVariable} ${bVariable}`.toLowerCase();

  if (
    variables.includes("career") ||
    variables.includes("goal") ||
    variables.includes("hours") ||
    variables.includes("timeline") ||
    variables.includes("compensation") ||
    variables.includes("remote") ||
    variables.includes("mentorship") ||
    variables.includes("education") ||
    variables.includes("hiree") ||
    variables.includes("publication") ||
    variables.includes("experience")
  ) {
    return "Goal";
  }

  if (
    variables.includes("field") ||
    variables.includes("discipline") ||
    variables.includes("sub_discipline") ||
    variables.includes("interest")
  ) {
    return "Field";
  }

  if (
    variables.includes("skill") ||
    variables.includes("technique")
  ) {
    return "Technique";
  }

  return "Other";
}

function percent(score, max) {
  if (max === 0) {
    return 0;
  }

  return (score / max) * 100;
}

function scoreCandidateVsLab(candidate, lab, matchingPairs) {
  let ruleScore = 0;
  let ruleMax = 0;
  let matchedPairs = [];

  let componentScores = {
    Technique: { score: 0, max: 0 },
    Field: { score: 0, max: 0 },
    Goal: { score: 0, max: 0 },
    Other: { score: 0, max: 0 }
  };

  for (let pair of matchingPairs) {
    const aVariable = pair.datasetAVariable;
    const bVariable = pair.datasetBVariable;
    const weight = Number(pair.weight) || 0;

    const labValue = lab[aVariable];
    const candidateValue = candidate[bVariable];

    const scoringComponent = getScoringComponent(aVariable, bVariable);

    let matchValue = 0;

    if (valuesMatch(candidateValue, labValue)) {
      matchValue = 1;
    }

    const score = matchValue * weight;

    ruleScore += score;
    ruleMax += weight;

    componentScores[scoringComponent].score += score;
    componentScores[scoringComponent].max += weight;

    if (matchValue > 0) {
      matchedPairs.push({
        scoringComponent: scoringComponent,
        datasetAVariable: aVariable,
        datasetBVariable: bVariable,
        labValue: labValue,
        candidateValue: candidateValue,
        weight: weight,
        matchValue: matchValue,
        score: score
      });
    }
  }

  const rulePercent = percent(ruleScore, ruleMax);

  const techniqueScore = componentScores.Technique.score;
  const techniqueMax = componentScores.Technique.max;
  const techniquePercent = percent(techniqueScore, techniqueMax);

  const fieldScore = componentScores.Field.score;
  const fieldMax = componentScores.Field.max;
  const fieldPercent = percent(fieldScore, fieldMax);

  const goalScore = componentScores.Goal.score;
  const goalMax = componentScores.Goal.max;
  const goalPercent = percent(goalScore, goalMax);

  return {
    ruleScore: ruleScore,
    ruleMax: ruleMax,
    rulePercent: rulePercent,

    techniqueScore: techniqueScore,
    techniqueMax: techniqueMax,
    techniquePercent: techniquePercent,

    fieldScore: fieldScore,
    fieldMax: fieldMax,
    fieldPercent: fieldPercent,

    goalScore: goalScore,
    goalMax: goalMax,
    goalPercent: goalPercent,

    componentScores: componentScores,
    matchedPairs: matchedPairs
  };
}

async function scoreCandidate(candidate, lab, matchingPairs) {
  const rule = scoreCandidateVsLab(candidate, lab, matchingPairs);

  const semantic = await semanticScore(
    candidate.Research_Statement_FreeText,
    lab.Lab_Description_FreeText
  );

  const semanticPercent = semantic * 100;

  // Final blend ratio: 80% rule-based + 20% semantic AI
  const combinedPercent = rule.rulePercent * 0.8 + semanticPercent * 0.2;

  return {
    ...rule,
    semanticPercent: semanticPercent,
    combinedPercent: combinedPercent
  };
}

module.exports = {
  scoreCandidateVsLab,
  scoreCandidate
};

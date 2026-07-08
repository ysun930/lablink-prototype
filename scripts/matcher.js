const { semanticScore } = require("./embedding");

function normalize(value) {
  return String(value).toLowerCase().trim();
}

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

// Shows which part of the algorithm each matching pair belongs to
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
    variables.includes("hiree")
  ) {
    return "Goal";
  }

  if (
    variables.includes("field") ||
    variables.includes("discipline")
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
    let aVariable = pair.datasetAVariable;
    let bVariable = pair.datasetBVariable;
    let weight = pair.weight;

    let labValue = lab[aVariable];
    let candidateValue = candidate[bVariable];

    let scoringComponent = getScoringComponent(aVariable, bVariable);

    let matchValue = 0;

    if (valuesMatch(candidateValue, labValue)) {
      matchValue = 1;
    } else {
      matchValue = 0;
    }

    let score = matchValue * weight;

    ruleScore += score;
    ruleMax += weight;

    componentScores[scoringComponent].score += score;
    componentScores[scoringComponent].max += weight;

    if (matchValue > 0) {
      matchedPairs.push({
        scoringComponent: scoringComponent,
        datasetAVariable: aVariable,
        datasetBVariable: bVariable,
        weight: weight,
        matchValue: matchValue,
        score: score
      });
    }
  }

  let rulePercent = (ruleScore / ruleMax) * 100;

  let goalPercent =
    componentScores.Goal.max > 0
      ? (componentScores.Goal.score / componentScores.Goal.max) * 100
      : 0;

  return {
    ruleScore: ruleScore,
    ruleMax: ruleMax,
    rulePercent: rulePercent,

    goalScore: componentScores.Goal.score,
    goalMax: componentScores.Goal.max,
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

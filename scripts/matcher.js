function scoreCandidateVsLab(candidate, lab, matchingPairs) {
  let ruleScore = 0;
  let ruleMax = 0;
  let matchedPairs = [];

  for (let pair of matchingPairs) {
    let aVariable = pair.datasetAVariable;
    let bVariable = pair.datasetBVariable;
    let weight = pair.weight;

    let labValue = lab[aVariable];
    let candidateValue = candidate[bVariable];

    let matchValue = 0;

    if (labValue === candidateValue) {
      matchValue = 1;
    } else if (
      Array.isArray(candidateValue) &&
      candidateValue.includes(labValue)
    ) {
      matchValue = 1;
    } else if (
      Array.isArray(labValue) &&
      labValue.includes(candidateValue)
    ) {
      matchValue = 1;
    } else {
      matchValue = 0;
    }

    let score = matchValue * weight;
    ruleScore += score;
    ruleMax += weight;

    if (matchValue > 0) {
      matchedPairs.push({
        datasetAVariable: aVariable,
        datasetBVariable: bVariable,
        weight: weight,
        matchValue: matchValue,
        score: score
      });
    }
  }

  let rulePercent = (ruleScore / ruleMax) * 100;

  return {
    ruleScore: ruleScore,
    ruleMax: ruleMax,
    rulePercent: rulePercent,
    matchedPairs: matchedPairs
  };
}

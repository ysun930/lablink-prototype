# LabLink Algorithm Specification

## 1. Overview

The LabLink algorithm matches candidates with labs by comparing lab-side variables from Dataset A with candidate-side variables from Dataset B.

It uses matching pairs, weights, and match values to calculate a final match percentage for each lab. The goal is to return a ranked list of labs that best fit each candidate's skills, field interests, goals, preferences, and availability.

---

## 2. Inputs

### Dataset A: Lab Profiles

Dataset A includes lab-side variables, including:

- Required techniques
- Preferred techniques
- Scientific fields
- Sub-disciplines
- Research aims
- Publication goals
- Career pathways supported
- Mentorship model
- Timeline expectations
- Institution type
- Funding source
- Hiree level sought
- GPA requirement
- Prerequisite coursework
- Prior experience requirement
- Lab description free text

### Dataset B: Candidate Profiles

Dataset B includes candidate-side variables, including:

- Candidate skills
- Proficiency levels
- Field interests
- Career goals
- Publication preferences
- Mentorship preferences
- Timeline preferences
- Compensation preferences
- Education level
- GPA range
- Completed coursework
- Research experience level

### Matching Pair Source

The algorithm uses the **B_MatchingPairs** tab.

Each row in **B_MatchingPairs** connects one Dataset A variable with one Dataset B variable and assigns a match weight.

---

## 3. Scoring Formula

For each candidate-lab comparison:

```text
Total_Score = SUM(weight_i × match_i)

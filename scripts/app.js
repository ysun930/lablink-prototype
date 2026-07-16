<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>LabLink Lab Profile</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 900px;
      margin: 30px auto;
      padding: 0 20px;
      background-color: #f5f7fb;
    }

    section {
      background-color: white;
      border: 1px solid #d9dfe8;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .score-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .score-badge {
      background-color: #eef3fb;
      border-radius: 6px;
      padding: 10px 14px;
    }

    footer {
      margin-top: 40px;
      padding: 15px;
      text-align: center;
      color: #555;
      border-top: 1px solid #ccc;
    }
  </style>
</head>

<body>
  <p>
    <a href="results.html">
      ← Back to Results
    </a>
  </p>

  <h1 id="lab-name">
    Lab Profile
  </h1>

  <section id="lab-information">
    <p>Loading lab information...</p>
  </section>

  <section
    id="score-section"
    hidden
  >
    <h2>Your Match Scores</h2>

    <div class="score-badges">
      <div class="score-badge">
        <strong>
          Combined Match
        </strong>

        <br>

        <span id="combined-score">
          0.0%
        </span>
      </div>

      <div class="score-badge">
        <strong>
          Rule-Based Score
        </strong>

        <br>

        <span id="rule-score">
          0.0%
        </span>
      </div>

      <div class="score-badge">
        <strong>
          AI Semantic Score
        </strong>

        <br>

        <span id="semantic-score">
          0.0%
        </span>
      </div>
    </div>

    <h3>
      Rule-Based Score Breakdown
    </h3>

    <p>
      <strong>Field Score:</strong>

      <span id="field-score">
        0.0%
      </span>
    </p>

    <p>
      <strong>Technique Score:</strong>

      <span id="technique-score">
        0.0%
      </span>
    </p>

    <p>
      <strong>Goal Score:</strong>

      <span id="goal-score">
        0.0%
      </span>
    </p>
  </section>

  <footer>
    <p>
      Semantic matching powered by Cohere Embed AI.
    </p>
  </footer>

  <script>
    const params =
      new URLSearchParams(
        window.location.search
      );

    const labId =
      params.get("labId");

    const labNameElement =
      document.getElementById(
        "lab-name"
      );

    const labInformationElement =
      document.getElementById(
        "lab-information"
      );

    const scoreSection =
      document.getElementById(
        "score-section"
      );

    function safePercent(value) {
      const number = Number(value);

      return Number.isFinite(number)
        ? `${number.toFixed(1)}%`
        : "0.0%";
    }

    function formatList(value) {
      if (Array.isArray(value)) {
        return value.join(", ");
      }

      return value || "Not available";
    }

    function displayLabProfile(profile) {
      if (!profile) {
        labInformationElement.innerHTML =
          "<p>Lab profile not found.</p>";

        return;
      }

      labNameElement.textContent =
        `${profile.Lab_ID || labId}: ${
          profile.Lab_Name ||
          "Lab Profile"
        }`;

      const subDisciplines =
        formatList(
          profile.Sub_discipline ||
          profile.Sub_disciplines
        );

      const requiredTechniques =
        profile.Required_Techniques ||
        formatList(
          profile.Required_Skills
        );

      labInformationElement.innerHTML = `
        <h2>Lab Information</h2>

        <p>
          <strong>Primary Field:</strong>
          ${
            profile.Primary_Field ||
            "Not available"
          }
        </p>

        <p>
          <strong>Sub-disciplines:</strong>
          ${subDisciplines}
        </p>

        <p>
          <strong>Lab Aim:</strong>
          ${
            profile.Lab_Aim ||
            "Not available"
          }
        </p>

        <p>
          <strong>Institution Type:</strong>
          ${
            profile.Institution_Type ||
            "Not available"
          }
        </p>

        <p>
          <strong>Lab Size:</strong>
          ${
            profile.Lab_Size ||
            "Not available"
          }
        </p>

        <p>
          <strong>Required Techniques:</strong>
          ${requiredTechniques}
        </p>

        <p>
          <strong>Preferred Techniques:</strong>
          ${
            profile.Preferred_Techniques ||
            "Not available"
          }
        </p>

        <p>
          <strong>Career Pathways:</strong>
          ${
            profile
              .Career_Pathways_Supported ||
            formatList(
              profile.Career_Goal
            )
          }
        </p>

        <p>
          <strong>Hiree Level:</strong>
          ${
            profile.Hiree_Level_Sought ||
            formatList(
              profile.Hiree_Level
            )
          }
        </p>

        <p>
          <strong>Hours:</strong>
          ${
            profile.Hours_Per_Week ||
            profile.Hours ||
            "Not available"
          }
        </p>

        <p>
          <strong>Compensation:</strong>
          ${
            profile.Compensation ||
            "Not available"
          }
        </p>

        <p>
          <strong>Remote Option:</strong>
          ${
            profile.Remote_Option ||
            profile.Remote ||
            "Not available"
          }
        </p>

        <p>
          <strong>Description:</strong>
          ${
            profile
              .Lab_Description_FreeText ||
            "Not available"
          }
        </p>
      `;
    }

    function displayScores(result) {
      if (!result) {
        scoreSection.hidden = true;
        return;
      }

      scoreSection.hidden = false;

      document.getElementById(
        "combined-score"
      ).textContent =
        safePercent(
          result.combinedPercent
        );

      document.getElementById(
        "rule-score"
      ).textContent =
        safePercent(
          result.rulePercent
        );

      document.getElementById(
        "semantic-score"
      ).textContent =
        safePercent(
          result.semanticPercent
        );

      document.getElementById(
        "field-score"
      ).textContent =
        safePercent(
          result.fieldPercent
        );

      document.getElementById(
        "technique-score"
      ).textContent =
        safePercent(
          result.techniquePercent
        );

      document.getElementById(
        "goal-score"
      ).textContent =
        safePercent(
          result.goalPercent
        );
    }

    async function loadProfile() {
      if (!labId) {
        labInformationElement.innerHTML =
          "<p>No Lab_ID was provided.</p>";

        scoreSection.hidden = true;
        return;
      }

      // Same key used in app.js and results.html
      const storedResults =
        sessionStorage.getItem(
          "labMatchResults"
        );

      const results = storedResults
        ? JSON.parse(storedResults)
        : [];

      const matchedResult =
        results.find(
          result =>
            result.Lab_ID === labId
        );

      if (matchedResult) {
        displayLabProfile(
          matchedResult.labProfile ||
          matchedResult
        );

        displayScores(matchedResult);
        return;
      }

      // Direct profile access:
      // load lab information without scores
      try {
        const response =
          await fetch(
            "../data/labs.json"
          );

        if (!response.ok) {
          throw new Error(
            `Could not load labs.json: ${response.status}`
          );
        }

        const labs =
          await response.json();

        const rawLab =
          labs.find(lab => {
            const currentId =
              lab[
                "Lab_ID (LAB-001 to LAB-005)"
              ] ||
              lab.Lab_ID;

            return currentId === labId;
          });

        if (!rawLab) {
          displayLabProfile(null);
          scoreSection.hidden = true;
          return;
        }

        const profile = {
          Lab_ID:
            rawLab[
              "Lab_ID (LAB-001 to LAB-005)"
            ] ||
            rawLab.Lab_ID,

          Lab_Name:
            rawLab.Lab_Name,

          Primary_Field:
            rawLab.Primary_Field,

          Sub_disciplines:
            rawLab.Sub_disciplines,

          Lab_Aim:
            rawLab.Lab_Aim,

          Institution_Type:
            rawLab.Institution_Type,

          Lab_Size:
            rawLab.Lab_Size,

          Required_Techniques:
            rawLab.Required_Techniques,

          Preferred_Techniques:
            rawLab.Preferred_Techniques,

          Career_Pathways_Supported:
            rawLab
              .Career_Pathways_Supported,

          Hiree_Level_Sought:
            rawLab.Hiree_Level_Sought,

          Hours_Per_Week:
            rawLab.Hours_Per_Week,

          Compensation:
            rawLab.Compensation,

          Remote_Option:
            rawLab.Remote_Option,

          Lab_Description_FreeText:
            rawLab
              .Lab_Description_FreeText
        };

        displayLabProfile(profile);

        // Scores remain hidden
        displayScores(null);
      } catch (error) {
        console.error(
          "Error loading lab profile:",
          error
        );

        labInformationElement.innerHTML =
          "<p>Unable to load this lab profile.</p>";

        scoreSection.hidden = true;
      }
    }

    loadProfile();
  </script>
</body>
</html>

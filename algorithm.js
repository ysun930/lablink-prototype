(() => {
  "use strict";

  const RESULTS_KEY = "labMatchResults";
  const CANDIDATE_KEY = "submittedCandidate";

  const pageName = location.pathname
    .split("/")
    .pop()
    .toLowerCase();

  function safeJsonParse(value, fallback) {
    try {
      if (!value) return fallback;
      const parsed = JSON.parse(value);
      if (parsed === null || parsed === undefined) return fallback;
      return parsed;
    } catch (error) {
      console.warn("Invalid saved data was ignored:", error);
      return fallback;
    }
  }

  async function loadLabs() {
    try {
      const response = await fetch('/api/labs');
      if (!response.ok) {
        console.error('Failed to fetch labs from API');
        return [];
      }
      const json = await response.json();
      const supabaseLabs = json.labs || json || [];
      return supabaseLabs.map(lab => ({
        id:                  lab.id,
        labName:             lab.lab_name,
        piName:              lab.pi_name,
        institution:         lab.institution,
        institutionType:     lab.institution_type,
        primaryField:        lab.primary_field,
        subDisciplines:      lab.sub_disciplines || [],
        requiredTechniques:  lab.required_techniques || [],
        preferredTechniques: lab.preferred_techniques || [],
        careerPathways:      lab.career_pathways || [],
        hireeLevel:          lab.hiree_level || [],
        hoursPerWeek:        lab.hours_per_week,
        compensation:        lab.compensation,
        workFormat:          lab.remote_option,
        description:         lab.description
      }));
    } catch (error) {
      console.error('Error loading labs:', error);
      return [];
    }
  }

  function normalize(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[–—-]/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9+.#\s]/g, " ")
      .replace(/\bwestern blotting\b/g, "western blot")
      .replace(/\bmammalian cell culture\b/g, "cell culture")
      .replace(/\bconfocal imaging\b/g, "confocal microscopy")
      .replace(/\bacademic credit\b/g, "credit")
      .replace(/\bfor credit\b/g, "credit")
      .replace(/\bin person\b/g, "in person")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toList(value) {
    if (Array.isArray(value)) return value.flatMap(toList).filter(Boolean);
    if (value === null || value === undefined || value === "") return [];
    return String(value).split(/[,;|\n]/).map(item => item.trim()).filter(Boolean);
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatList(value) {
    const items = toList(value);
    return items.length ? items.join(", ") : "Not provided";
  }

  function controlValue(control) {
    if (!control) return [];
    if (typeof RadioNodeList !== "undefined" && control instanceof RadioNodeList) {
      return [...control].filter(item => item.checked).map(item => item.value);
    }
    if (control instanceof HTMLSelectElement && control.multiple) {
      return [...control.selectedOptions].map(option => option.value || option.textContent);
    }
    if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
      return control.checked ? [control.value] : [];
    }
    return control.value ?? "";
  }

  function readField(form, aliases) {
    const values = [];
    for (const alias of aliases) {
      const namedControl = form.elements.namedItem(alias);
      const idControl = document.getElementById(alias);
      if (namedControl) values.push(...toList(controlValue(namedControl)));
      if (idControl && idControl.form === form) values.push(...toList(controlValue(idControl)));
      const target = normalize(alias).replace(/\s/g, "");
      const controls = form.querySelectorAll("input, select, textarea");
      for (const control of controls) {
        const identity = normalize(`${control.name || ""} ${control.id || ""}`).replace(/\s/g, "");
        if (identity === target) values.push(...toList(controlValue(control)));
      }
    }
    return unique(values);
  }

  function firstValue(form, aliases) {
    return readField(form, aliases)[0] || "";
  }

  function valuesMatch(left, right) {
    const leftItems = toList(left).map(normalize).filter(Boolean);
    const rightItems = toList(right).map(normalize).filter(Boolean);
    return leftItems.some(leftItem =>
      rightItems.some(rightItem => {
        if (leftItem === rightItem) return true;
        if (leftItem.length < 4 || rightItem.length < 4) return false;
        return leftItem.includes(rightItem) || rightItem.includes(leftItem);
      })
    );
  }

  const FIELD_GROUPS = [
    ["molecular biology", "cell biology", "biochemistry"],
    ["genetics", "genomics", "genetics and genomics", "bioinformatics", "computational biology"],
    ["neuroscience", "neurobiology", "cognitive neuroscience"],
    ["immunology", "microbiology", "infectious disease"],
    ["oncology", "cancer biology", "tumor biology"],
    ["public health", "epidemiology", "global health"],
    ["pharmacology", "toxicology", "drug discovery"],
    ["biomedical engineering", "bioengineering"]
  ];

  function fieldsRelated(left, right) {
    const leftField = normalize(left);
    const rightField = normalize(right);
    if (!leftField || !rightField) return false;
    if (leftField === rightField || leftField.includes(rightField) || rightField.includes(leftField)) return true;
    return FIELD_GROUPS.some(group => {
      const normalizedGroup = group.map(normalize);
      const containsLeft = normalizedGroup.some(field => leftField.includes(field) || field.includes(leftField));
      const containsRight = normalizedGroup.some(field => rightField.includes(field) || field.includes(rightField));
      return containsLeft && containsRight;
    });
  }

  function techniqueOverlap(candidateSkills, labSkills) {
    const candidate = unique(toList(candidateSkills).map(normalize).filter(Boolean));
    const lab = unique(toList(labSkills).map(normalize).filter(Boolean));
    if (lab.length === 0) return 0;
    let matched = 0;
    for (const labSkill of lab) {
      const found = candidate.some(candidateSkill => {
        if (candidateSkill === labSkill) return true;
        if (candidateSkill.length < 4 || labSkill.length < 4) return false;
        return candidateSkill.includes(labSkill) || labSkill.includes(candidateSkill);
      });
      if (found) matched += 1;
    }
    return matched / lab.length;
  }

  function educationMatch(candidateEducation, labEducation) {
    const candidate = normalize(candidateEducation);
    const labLevels = toList(labEducation).map(normalize);
    if (!candidate || labLevels.length === 0) return false;
    if (labLevels.some(level => level.includes("any") || level.includes("all"))) return true;
    if (labLevels.some(level => level.includes(candidate) || candidate.includes(level))) return true;
    const undergraduateLevels = ["high school", "freshman", "sophomore", "junior", "senior", "undergraduate"];
    const graduateLevels = ["master", "masters", "phd", "doctoral", "graduate"];
    const candidateIsUndergraduate = undergraduateLevels.some(level => candidate.includes(level));
    if (candidateIsUndergraduate) return labLevels.some(level => undergraduateLevels.some(u => level.includes(u)));
    const candidateIsGraduate = graduateLevels.some(level => candidate.includes(level));
    if (candidateIsGraduate) return labLevels.some(level => graduateLevels.some(g => level.includes(g)));
    return false;
  }

  function parseHours(value) {
    const text = normalize(value);
    const numbers = text.match(/\d+/g)?.map(Number) || [];
    if (text.includes("full time") || text.includes("20+")) return { min: 20, max: Infinity };
    if (text.includes("less than") || text.includes("under")) return { min: 0, max: numbers[0] || 10 };
    if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
    if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
    if (text.includes("part time")) return { min: 10, max: 20 };
    return null;
  }

  function hoursMatch(candidateHours, labHours) {
    const candidate = parseHours(candidateHours);
    const lab = parseHours(labHours);
    if (!candidate || !lab) return valuesMatch(candidateHours, labHours);
    return candidate.max >= lab.min && lab.max >= candidate.min;
  }

  function workFormatMatch(candidateFormat, labFormat) {
    const candidate = normalize(candidateFormat);
    const lab = normalize(labFormat);
    if (!candidate || !lab) return false;
    if (candidate.includes("flexible") || lab.includes("flexible")) return true;
    if (candidate.includes("hybrid") && (lab.includes("hybrid") || lab.includes("remote") || lab.includes("in person"))) return true;
    return valuesMatch(candidate, lab);
  }

  function buildLab(form) {
    const hasRandomUUID = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
    return {
      id: hasRandomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      labName: firstValue(form, ["labName", "lab_name", "lab-name", "name"]),
      piName: firstValue(form, ["piName", "pi_name", "pi-name", "principalInvestigator"]),
      institution: firstValue(form, ["institution", "university", "organization"]),
      primaryField: firstValue(form, ["primaryField", "primary_field", "primary-field", "field"]),
      subDisciplines: readField(form, ["subDiscipline", "subDisciplines", "sub_disciplines", "sub-discipline", "sub-disciplines"]),
      requiredTechniques: readField(form, ["requiredTechniques", "requiredSkills", "required_techniques", "required-techniques", "techniques", "skills"]),
      preferredTechniques: readField(form, ["preferredTechniques", "preferredSkills", "preferred_techniques", "preferred-techniques"]),
      careerPathways: readField(form, ["careerPathways", "careerGoals", "career_pathways", "career-pathways"]),
      hireeLevel: readField(form, ["hireeLevel", "educationLevel", "hiree_level", "hiree-level", "education-level"]),
      hoursPerWeek: firstValue(form, ["hoursPerWeek", "hours", "hours_per_week", "hours-per-week"]),
      compensation: readField(form, ["compensation", "compensationType", "compensation_type"]),
      workFormat: firstValue(form, ["workFormat", "remoteOption", "work_format", "remote_option", "work-format", "remote-option"]),
      description: firstValue(form, ["description", "labDescription", "researchDescription", "lab_description", "research_description"]),
      createdAt: new Date().toISOString()
    };
  }

  function buildCandidate(form) {
    return {
      candidateName: firstValue(form, ["candidateName", "candidate_name", "candidate-name", "name"]),
      primaryField: firstValue(form, ["primaryField", "primary_field", "primary-field", "field"]),
      subDisciplines: readField(form, ["subDiscipline", "subDisciplines", "sub_disciplines", "sub-discipline", "sub-disciplines"]),
      skills: readField(form, ["skills", "techniques", "researchSkills", "research_skills", "research-skills"]),
      careerGoal: firstValue(form, ["careerGoal", "career_goal", "career-goal"]),
      educationLevel: firstValue(form, ["educationLevel", "education_level", "education-level"]),
      hoursAvailable: firstValue(form, ["hoursAvailable", "hours_available", "hours-available", "hours"]),
      compensationPreference: firstValue(form, ["compensationPreference", "compensation_need", "compensation-preference", "compensation"]),
      workFormatPreference: firstValue(form, ["workFormatPreference", "remotePreference", "work_format_preference", "remote_preference", "work-format-preference", "workFormat"]),
      researchStatement: firstValue(form, ["researchStatement", "research_statement", "research-statement", "statement", "description"])
    };
  }

  function scoreLab(candidate, lab) {
    let fieldScore = 0;
    let techniqueScore = 0;
    let goalScore = 0;

    if (normalize(candidate.primaryField) === normalize(lab.primaryField)) {
      fieldScore += 3;
    } else if (fieldsRelated(candidate.primaryField, lab.primaryField)) {
      fieldScore += 1.5;
    }

    if (valuesMatch(candidate.subDisciplines, lab.subDisciplines)) fieldScore += 2;

    const allLabTechniques = [...toList(lab.requiredTechniques), ...toList(lab.preferredTechniques)];
    techniqueScore = techniqueOverlap(candidate.skills, allLabTechniques) * 18;

    if (valuesMatch(candidate.careerGoal, lab.careerPathways)) goalScore += 3;
    if (educationMatch(candidate.educationLevel, lab.hireeLevel)) goalScore += 3;
    if (hoursMatch(candidate.hoursAvailable, lab.hoursPerWeek)) goalScore += 3;
    if (valuesMatch(candidate.compensationPreference, lab.compensation)) goalScore += 2;
    if (workFormatMatch(candidate.workFormatPreference, lab.workFormat)) goalScore += 3;

    const rawScore = fieldScore + techniqueScore + goalScore;
    const matchPercent = Math.max(0, Math.min(100, rawScore / 37 * 100));
    const rulePercent = matchPercent;

    return {
      ...lab,
      fieldScore: Number(fieldScore.toFixed(2)),
      techniqueScore: Number(techniqueScore.toFixed(2)),
      goalScore: Number(goalScore.toFixed(2)),
      rawScore: Number(rawScore.toFixed(2)),
      matchPercent: Number(matchPercent.toFixed(1)),
      rulePercent: Number(rulePercent.toFixed(1)),
      semanticPercent: 0
    };
  }

  function showMessage(form, message, isError = false) {
    let messageBox = form.querySelector("#status-message, .status-message, [data-status]");
    if (!messageBox) {
      messageBox = document.createElement("p");
      messageBox.id = "status-message";
      form.appendChild(messageBox);
    }
    messageBox.textContent = message;
    messageBox.style.marginTop = "15px";
    messageBox.style.fontWeight = "700";
    messageBox.style.color = isError ? "#b42318" : "#067647";
  }

  function setupLabForm() {
    const form = document.getElementById("lab-form") || document.querySelector("form");
    if (!form) { console.error("Lab form was not found."); return; }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const lab = buildLab(form);
      if (!lab.labName || !lab.primaryField) {
        showMessage(form, "Please enter the lab name and primary field.", true);
        return;
      }

      try {
        showMessage(form, "Saving lab profile...");
        const response = await fetch('/api/register-lab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lab_name:             lab.labName,
            pi_name:              lab.piName,
            institution:          lab.institution,
            primary_field:        lab.primaryField,
            sub_disciplines:      lab.subDisciplines,
            required_techniques:  lab.requiredTechniques,
            preferred_techniques: lab.preferredTechniques,
            career_pathways:      lab.careerPathways,
            hiree_level:          lab.hireeLevel,
            hours_per_week:       lab.hoursPerWeek,
            compensation:         lab.compensation,
            remote_option:        lab.workFormat,
            description:          lab.description
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save lab');
        showMessage(form, "Lab profile saved successfully and is now live on LabLink.");
      } catch (error) {
        console.error('Error saving lab:', error);
        showMessage(form, "Error saving lab profile: " + error.message, true);
      }
    }, true);
  }

  async function setupCandidateForm() {
    const form = document.getElementById("candidate-form") || document.querySelector("form");
    if (!form) { console.error("Candidate form was not found."); return; }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const candidate = buildCandidate(form);
      if (!candidate.candidateName || !candidate.primaryField) {
        showMessage(form, "Please enter the candidate name and primary field.", true);
        return;
      }

if (window.supabaseClient && window.currentUserId) {
      const subs = Array.isArray(candidate.subDisciplines)
        ? candidate.subDisciplines
        : String(candidate.subDisciplines || "")
            .split(",").map(s => s.trim()).filter(Boolean);

      const { error: saveError } = await window.supabaseClient
        .from("candidates")
        .insert({
          user_id: window.currentUserId,
          candidate_name: candidate.candidateName,
          education_level: candidate.educationLevel,
          primary_field_interest: candidate.primaryField,
          sub_discipline_interests: subs,
          confirmed_skills: candidate.skills,
          career_goal: candidate.careerGoal,
          hours_available: candidate.hoursAvailable,
          compensation_need: candidate.compensationPreference,
          remote_preference: candidate.workFormatPreference,
          research_statement: candidate.researchStatement
        });

      if (saveError) {
        console.error("Could not save candidate:", saveError.message);
      }
    }

      const labs = await loadLabs();
      if (labs.length === 0) {
        showMessage(form, "No labs have been saved. Submit at least one lab profile first.", true);
        return;
      }

      showMessage(form, "Finding your best lab matches...");

const response = await fetch('/api/match', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ candidate })
});

const json = await response.json();
const results = (json.results || json || []).sort(
  (a, b) => Number(b.combinedPercent || 0) - Number(a.combinedPercent || 0)
);

sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results));
sessionStorage.setItem(CANDIDATE_KEY, JSON.stringify(candidate));
location.href = "results.html";
    }, true);
  }

  function generateCard(result, index) {
  const lab = result.labProfile || result;
  const matchPercent = Number(result.combinedPercent || result.matchPercent || 0).toFixed(1);
  const rulePercent = Number(result.rulePercent || 0).toFixed(1);
  const semanticPercent = Number(result.semanticPercent || 0).toFixed(1);

  return `
    <article style="padding: 22px; margin-bottom: 20px; border: 1px solid #d0d5dd; border-radius: 10px; background: white; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);">
      <h2 style="margin-top: 0; color: #173f8a;">
        Rank ${index + 1}: ${escapeHtml(result.labName || lab.lab_name || "Unnamed Lab")}
      </h2>
      <p style="font-size: 24px; font-weight: 700; color: #067647;">
        Match: ${matchPercent}%
      </p>
      <p><strong>Rule-Based Score:</strong> ${rulePercent}%</p>
      <p><strong>AI Semantic Score:</strong> ${semanticPercent}%</p>
      <p><strong>Field Score:</strong> ${Number(result.fieldScore || 0).toFixed(1)} / 5</p>
      <p><strong>Technique Score:</strong> ${Number(result.techniqueScore || 0).toFixed(1)} / 18</p>
      <p><strong>Goals and Logistics:</strong> ${Number(result.goalScore || 0).toFixed(1)} / 14</p>
      <p><strong>Institution:</strong> ${escapeHtml(lab.institution || "Not provided")}</p>
      <p><strong>PI:</strong> ${escapeHtml(lab.pi_name || "Not provided")}</p>
      <p><strong>Primary Field:</strong> ${escapeHtml(lab.primary_field || "Not provided")}</p>
      <p><strong>Required Techniques:</strong> ${escapeHtml(formatList(lab.required_techniques))}</p>
      <p><strong>Description:</strong> ${escapeHtml(lab.description || "Not provided")}</p>
      ${result.whyItMatches ? `
        <details style="margin-top: 16px;">
          <summary style="cursor: pointer; font-weight: bold; color: #006b5f;">Why this match?</summary>
          <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.8;">
            ${result.whyItMatches.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}
          </ul>
        </details>
      ` : ''}
    </article>
  `;
}

  function renderResultsPage() {
    let container = document.getElementById("results-container");
    if (!container) {
      container = document.createElement("main");
      container.id = "results-container";
      container.style.maxWidth = "900px";
      container.style.margin = "30px auto";
      container.style.padding = "20px";
      document.body.appendChild(container);
    }

    const savedResults = safeJsonParse(sessionStorage.getItem(RESULTS_KEY), []);
    const results = Array.isArray(savedResults) ? savedResults : [];
    const candidate = safeJsonParse(sessionStorage.getItem(CANDIDATE_KEY), {});

    if (results.length === 0) {
      container.innerHTML = `<p>No match results were found. Return to the Candidate Form and submit your profile again.</p>`;
      return;
    }

    const heading = document.getElementById("candidate-heading");
    if (heading && candidate.candidateName) {
      heading.textContent = `Matches for ${escapeHtml(candidate.candidateName)}`;
    }

    results.sort((a, b) => Number(b.combinedPercent || b.matchPercent || 0) - Number(a.combinedPercent || a.matchPercent || 0));
    container.innerHTML = results.map((result, index) => generateCard(result, index)).join('');

    // Wire up sort dropdown
    const sortSelect = document.getElementById('sort-results');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        const key = sortSelect.value;
        results.sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0));
        container.innerHTML = results.map((result, index) => generateCard(result, index)).join('');
      });
    }
  }

  if (pageName.includes("labform") || document.getElementById("lab-form")) {
    setupLabForm();
  } else if (pageName.includes("candidate_form") || document.getElementById("candidate-form")) {
    setupCandidateForm();
  } else if (pageName.includes("results") || document.getElementById("results-container")) {
    renderResultsPage();
  }
})();
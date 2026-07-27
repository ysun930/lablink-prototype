(() => {
  "use strict";

  const LABS_KEY = "lablinkLabs";
  const RESULTS_KEY = "labMatchResults";
  const CANDIDATE_KEY = "submittedCandidate";

  const pageName = location.pathname
    .split("/")
    .pop()
    .toLowerCase();

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
      "bioinformatics",
      "computational biology"
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

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function normalize(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[–—-]/g, " ")
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

  function unique(values) {
    return [
      ...new Set(
        values.filter(Boolean)
      )
    ];
  }

  function valueFromElement(element) {
    if (!element) {
      return [];
    }

    if (
      typeof RadioNodeList !== "undefined" &&
      element instanceof RadioNodeList
    ) {
      return [...element]
        .filter(item => item.checked)
        .map(item => item.value);
    }

    if (
      element instanceof HTMLSelectElement &&
      element.multiple
    ) {
      return [...element.selectedOptions]
        .map(option =>
          option.value ||
          option.textContent
        );
    }

    if (
      element instanceof HTMLInputElement &&
      (
        element.type === "checkbox" ||
        element.type === "radio"
      )
    ) {
      return element.checked
        ? [element.value]
        : [];
    }

    return element.value ?? "";
  }

  function readField(form, aliases) {
    const collected = [];

    for (const alias of aliases) {
      const named =
        form.elements.namedItem(alias);

      const byId =
        document.getElementById(alias);

      if (named) {
        collected.push(
          ...toList(
            valueFromElement(named)
          )
        );
      }

      if (
        byId &&
        byId.form === form
      ) {
        collected.push(
          ...toList(
            valueFromElement(byId)
          )
        );
      }

      const normalizedAlias =
        normalize(alias)
          .replace(/\s/g, "");

      for (
        const element of form.querySelectorAll(
          "input, select, textarea"
        )
      ) {
        const identity = normalize(
          `${element.name || ""} ${element.id || ""}`
        ).replace(/\s/g, "");

        if (
          identity === normalizedAlias
        ) {
          collected.push(
            ...toList(
              valueFromElement(element)
            )
          );
        }
      }
    }

    return unique(collected);
  }

  function firstValue(form, aliases) {
    return (
      readField(form, aliases)[0] ||
      ""
    );
  }

  function arraysMatch(left, right) {
    const leftItems = toList(left)
      .map(normalize)
      .filter(Boolean);

    const rightItems = toList(right)
      .map(normalize)
      .filter(Boolean);

    return leftItems.some(
      leftItem =>
        rightItems.some(rightItem => {
          if (
            leftItem === rightItem
          ) {
            return true;
          }

          /*
            Prevent short values such as "R"
            from matching PCR or CRISPR.
          */
          if (
            leftItem.length < 4 ||
            rightItem.length < 4
          ) {
            return false;
          }

          return (
            leftItem.includes(rightItem) ||
            rightItem.includes(leftItem)
          );
        })
    );
  }

  function relatedField(left, right) {
    const leftField =
      normalize(left);

    const rightField =
      normalize(right);

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
        normalizedGroup.some(item =>
          leftField.includes(item) ||
          item.includes(leftField)
        );

      const containsRight =
        normalizedGroup.some(item =>
          rightField.includes(item) ||
          item.includes(rightField)
        );

      return (
        containsLeft &&
        containsRight
      );
    });
  }

  function overlapRatio(
    candidateValues,
    labValues
  ) {
    const candidate = unique(
      toList(candidateValues)
        .map(normalize)
        .filter(Boolean)
    );

    const lab = unique(
      toList(labValues)
        .map(normalize)
        .filter(Boolean)
    );

    if (lab.length === 0) {
      return 0;
    }

    let matched = 0;

    for (const labItem of lab) {
      const found =
        candidate.some(candidateItem => {
          if (
            candidateItem === labItem
          ) {
            return true;
          }

          if (
            candidateItem.length < 4 ||
            labItem.length < 4
          ) {
            return false;
          }

          return (
            candidateItem.includes(labItem) ||
            labItem.includes(candidateItem)
          );
        });

      if (found) {
        matched += 1;
      }
    }

    return matched / lab.length;
  }

  function educationMatch(
    candidateValue,
    labValues
  ) {
    const candidate =
      normalize(candidateValue);

    const labs =
      toList(labValues)
        .map(normalize);

    if (
      !candidate ||
      labs.length === 0
    ) {
      return false;
    }

    if (
      labs.some(value =>
        value.includes("any") ||
        value.includes("all")
      )
    ) {
      return true;
    }

    if (
      labs.some(value =>
        value.includes(candidate) ||
        candidate.includes(value)
      )
    ) {
      return true;
    }

    const undergraduateLevels = [
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

    if (
      undergraduateLevels.some(level =>
        candidate.includes(level)
      )
    ) {
      return labs.some(value =>
        undergraduateLevels.some(level =>
          value.includes(level)
        )
      );
    }

    if (
      graduateLevels.some(level =>
        candidate.includes(level)
      )
    ) {
      return labs.some(value =>
        graduateLevels.some(level =>
          value.includes(level)
        )
      );
    }

    return false;
  }

  function parseHours(value) {
    const text =
      normalize(value);

    const numbers =
      text.match(/\d+/g)
        ?.map(Number) || [];

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

    if (
      text.includes("part time")
    ) {
      return {
        min: 10,
        max: 20
      };
    }

    return null;
  }

  function hoursMatch(
    candidateValue,
    labValue
  ) {
    const candidate =
      parseHours(candidateValue);

    const lab =
      parseHours(labValue);

    if (
      !candidate ||
      !lab
    ) {
      return arraysMatch(
        candidateValue,
        labValue
      );
    }

    return (
      candidate.max >= lab.min &&
      lab.max >= candidate.min
    );
  }

  function workFormatMatch(
    candidateValue,
    labValue
  ) {
    const candidate =
      normalize(candidateValue);

    const lab =
      normalize(labValue);

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

    return arraysMatch(
      candidate,
      lab
    );
  }

  /*
  ================================================
  READ LAB FORM
  ================================================
  */

  function buildLab(form) {
    return {
      id:
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,

      labName: firstValue(
        form,
        [
          "labName",
          "lab_name",
          "lab-name",
          "name"
        ]
      ),

      piName: firstValue(
        form,
        [
          "piName",
          "pi_name",
          "pi-name",
          "principalInvestigator"
        ]
      ),

      institution: firstValue(
        form,
        [
          "institution",
          "university",
          "organization"
        ]
      ),

      primaryField: firstValue(
        form,
        [
          "primaryField",
          "primary_field",
          "primary-field",
          "field"
        ]
      ),

      subDisciplines: readField(
        form,
        [
          "subDiscipline",
          "subDisciplines",
          "sub_disciplines",
          "sub-discipline",
          "sub-disciplines"
        ]
      ),

      requiredTechniques: readField(
        form,
        [
          "requiredTechniques",
          "requiredSkills",
          "required_techniques",
          "required-techniques",
          "techniques",
          "skills"
        ]
      ),

      preferredTechniques: readField(
        form,
        [
          "preferredTechniques",
          "preferredSkills",
          "preferred_techniques",
          "preferred-techniques"
        ]
      ),

      careerPathways: readField(
        form,
        [
          "careerPathways",
          "careerGoals",
          "career_pathways",
          "career-pathways"
        ]
      ),

      hireeLevel: readField(
        form,
        [
          "hireeLevel",
          "educationLevel",
          "hiree_level",
          "hiree-level",
          "education-level"
        ]
      ),

      hoursPerWeek: firstValue(
        form,
        [
          "hoursPerWeek",
          "hours",
          "hours_per_week",
          "hours-per-week"
        ]
      ),

      compensation: readField(
        form,
        [
          "compensation",
          "compensationType",
          "compensation_type"
        ]
      ),

      workFormat: firstValue(
        form,
        [
          "workFormat",
          "remoteOption",
          "work_format",
          "remote_option",
          "work-format",
          "remote-option"
        ]
      ),

      description: firstValue(
        form,
        [
          "description",
          "labDescription",
          "researchDescription",
          "lab_description",
          "research_description"
        ]
      ),

      createdAt:
        new Date().toISOString()
    };
  }

  /*
  ================================================
  READ CANDIDATE FORM
  ================================================
  */

  function buildCandidate(form) {
    return {
      candidateName: firstValue(
        form,
        [
          "candidateName",
          "candidate_name",
          "candidate-name",
          "name"
        ]
      ),

      primaryField: firstValue(
        form,
        [
          "primaryField",
          "primary_field",
          "primary-field",
          "field"
        ]
      ),

      subDisciplines: readField(
        form,
        [
          "subDiscipline",
          "subDisciplines",
          "sub_disciplines",
          "sub-discipline",
          "sub-disciplines"
        ]
      ),

      skills: readField(
        form,
        [
          "skills",
          "techniques",
          "researchSkills",
          "research_skills",
          "research-skills"
        ]
      ),

      careerGoal: firstValue(
        form,
        [
          "careerGoal",
          "career_goal",
          "career-goal"
        ]
      ),

      educationLevel: firstValue(
        form,
        [
          "educationLevel",
          "education_level",
          "education-level"
        ]
      ),

      hoursAvailable: firstValue(
        form,
        [
          "hoursAvailable",
          "hours_available",
          "hours-available",
          "hours"
        ]
      ),

      compensationPreference:
        firstValue(
          form,
          [
            "compensationPreference",
            "compensation_need",
            "compensation-preference",
            "compensation"
          ]
        ),

      workFormatPreference:
        firstValue(
          form,
          [
            "workFormatPreference",
            "remotePreference",
            "work_format_preference",
            "remote_preference",
            "work-format-preference",
            "workFormat"
          ]
        ),

      researchStatement:
        firstValue(
          form,
          [
            "researchStatement",
            "research_statement",
            "research-statement",
            "statement",
            "description"
          ]
        )
    };
  }

  /*
  ================================================
  MATCHING ALGORITHM
  ================================================
  */

  function scoreLab(
    candidate,
    lab
  ) {
    let fieldScore = 0;
    let techniqueScore = 0;
    let goalScore = 0;

    /*
      Field score: maximum 5
    */

    if (
      normalize(candidate.primaryField) ===
      normalize(lab.primaryField)
    ) {
      fieldScore += 3;
    } else if (
      relatedField(
        candidate.primaryField,
        lab.primaryField
      )
    ) {
      fieldScore += 1.5;
    }

    if (
      arraysMatch(
        candidate.subDisciplines,
        lab.subDisciplines
      )
    ) {
      fieldScore += 2;
    }

    /*
      Techniques score: maximum 18
    */

    const allTechniques = [
      ...toList(
        lab.requiredTechniques
      ),
      ...toList(
        lab.preferredTechniques
      )
    ];

    techniqueScore =
      overlapRatio(
        candidate.skills,
        allTechniques
      ) * 18;

    /*
      Goals and logistics: maximum 14
    */

    if (
      arraysMatch(
        candidate.careerGoal,
        lab.careerPathways
      )
    ) {
      goalScore += 3;
    }

    if (
      educationMatch(
        candidate.educationLevel,
        lab.hireeLevel
      )
    ) {
      goalScore += 3;
    }

    if (
      hoursMatch(
        candidate.hoursAvailable,
        lab.hoursPerWeek
      )
    ) {
      goalScore += 3;
    }

    if (
      arraysMatch(
        candidate.compensationPreference,
        lab.compensation
      )
    ) {
      goalScore += 2;
    }

    if (
      workFormatMatch(
        candidate.workFormatPreference,
        lab.workFormat
      )
    ) {
      goalScore += 3;
    }

    const rawScore =
      fieldScore +
      techniqueScore +
      goalScore;

    const matchPercent =
      Math.max(
        0,
        Math.min(
          100,
          rawScore / 37 * 100
        )
      );

    return {
      ...lab,

      fieldScore:
        Number(
          fieldScore.toFixed(2)
        ),

      techniqueScore:
        Number(
          techniqueScore.toFixed(2)
        ),

      goalScore:
        Number(
          goalScore.toFixed(2)
        ),

      rawScore:
        Number(
          rawScore.toFixed(2)
        ),

      matchPercent:
        Number(
          matchPercent.toFixed(1)
        )
    };
  }

  function showMessage(
    form,
    message,
    isError = false
  ) {
    let target =
      form.querySelector(
        "#status-message, .status-message, [data-status]"
      );

    if (!target) {
      target =
        document.createElement("p");

      target.id =
        "status-message";

      form.appendChild(target);
    }

    target.textContent =
      message;

    target.style.color =
      isError
        ? "#b42318"
        : "#067647";

    target.style.fontWeight =
      "600";
  }

  /*
  ================================================
  LAB SUBMISSION
  ================================================
  */

  function setupLabForm() {
    const form =
      document.getElementById(
        "lab-form"
      ) ||
      document.querySelector("form");

    if (!form) {
      return;
    }

    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        /*
          Prevent old form scripts
          from performing another submission.
        */
        event.stopImmediatePropagation();

        const lab =
          buildLab(form);

        if (
          !lab.labName ||
          !lab.primaryField
        ) {
          showMessage(
            form,
            "Please enter the lab name and primary field.",
            true
          );

          return;
        }

        const labs =
          safeJsonParse(
            localStorage.getItem(
              LABS_KEY
            ),
            []
          );

        const duplicateIndex =
          labs.findIndex(item =>
            normalize(item.labName) ===
            normalize(lab.labName)
          );

        if (
          duplicateIndex >= 0
        ) {
          labs[duplicateIndex] = {
            ...labs[duplicateIndex],
            ...lab,
            id:
              labs[duplicateIndex].id
          };
        } else {
          labs.push(lab);
        }

        localStorage.setItem(
          LABS_KEY,
          JSON.stringify(labs)
        );

        showMessage(
          form,
          `Lab saved. ${labs.length} lab profile(s) are available for matching.`
        );
      },
      true
    );
  }

  /*
  ================================================
  CANDIDATE SUBMISSION
  ================================================
  */

  function setupCandidateForm() {
    const form =
      document.getElementById(
        "candidate-form"
      ) ||
      document.querySelector("form");

    if (!form) {
      return;
    }

    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const candidate =
          buildCandidate(form);

        if (
          !candidate.candidateName ||
          !candidate.primaryField
        ) {
          showMessage(
            form,
            "Please enter the candidate name and primary field.",
            true
          );

          return;
        }

        const labs =
          safeJsonParse(
            localStorage.getItem(
              LABS_KEY
            ),
            []
          );

        if (
          !Array.isArray(labs) ||
          labs.length === 0
        ) {
          showMessage(
            form,
            "No labs have been submitted. Submit at least one lab form first.",
            true
          );

          return;
        }

        /*
          Calculate every Lab score
          and sort highest to lowest.
        */

        const results =
          labs
            .map(lab =>
              scoreLab(
                candidate,
                lab
              )
            )
            .sort(
              (first, second) =>
                second.matchPercent -
                first.matchPercent
            );

        sessionStorage.setItem(
          RESULTS_KEY,
          JSON.stringify(results)
        );

        sessionStorage.setItem(
          CANDIDATE_KEY,
          JSON.stringify(candidate)
        );

        location.href =
          "results.html";
      },
      true
    );
  }

  /*
  ================================================
  RESULTS PAGE
  ================================================
  */

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatList(value) {
    const values =
      toList(value);

    return values.length
      ? values.join(", ")
      : "Not provided";
  }

  function renderResultsPage() {
    let container =
      document.getElementById(
        "results-container"
      );

    if (!container) {
      container =
        document.createElement("main");

      container.id =
        "results-container";

      document.body.appendChild(
        container
      );
    }

    const results =
      safeJsonParse(
        sessionStorage.getItem(
          RESULTS_KEY
        ),
        []
      );

    const candidate =
      safeJsonParse(
        sessionStorage.getItem(
          CANDIDATE_KEY
        ),
        {}
      );

    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      container.innerHTML = `
        <p>
          No results found.
          Return to the candidate form
          and submit again.
        </p>
      `;

      return;
    }

    const heading =
      document.getElementById(
        "candidate-heading"
      );

    if (
      heading &&
      candidate.candidateName
    ) {
      heading.textContent =
        `Matches for ${candidate.candidateName}`;
    }

    container.innerHTML =
      results.map(
        (result, index) => `
          <article
            class="match-card"
            style="
              padding: 20px;
              margin: 16px 0;
              border: 1px solid #d0d5dd;
              border-radius: 10px;
              background: white;
            "
          >
            <h2>
              Rank ${index + 1}:
              ${escapeHtml(
                result.labName ||
                "Unnamed Lab"
              )}
            </h2>

            <p
              style="
                font-size: 1.35rem;
                font-weight: 700;
              "
            >
              Match:
              ${result.matchPercent.toFixed(1)}%
            </p>

            <p>
              <strong>Field:</strong>
              ${result.fieldScore} / 5
            </p>

            <p>
              <strong>Techniques:</strong>
              ${result.techniqueScore} / 18
            </p>

            <p>
              <strong>
                Goals and Logistics:
              </strong>

              ${result.goalScore} / 14
            </p>

            <p>
              <strong>Primary Field:</strong>

              ${escapeHtml(
                result.primaryField ||
                "Not provided"
              )}
            </p>

            <p>
              <strong>
                Required Techniques:
              </strong>

              ${escapeHtml(
                formatList(
                  result.requiredTechniques
                )
              )}
            </p>

            <p>
              <strong>Institution:</strong>

              ${escapeHtml(
                result.institution ||
                "Not provided"
              )}
            </p>

            <p>
              <strong>Description:</strong>

              ${escapeHtml(
                result.description ||
                "Not provided"
              )}
            </p>
          </article>
        `
      ).join("");
  }

  /*
  ================================================
  DETECT CURRENT PAGE
  ================================================
  */

  if (
    pageName.includes("labform") ||
    document.getElementById(
      "lab-form"
    )
  ) {
    setupLabForm();
  } else if (
    pageName.includes(
      "candidate_form"
    ) ||
    document.getElementById(
      "candidate-form"
    )
  ) {
    setupCandidateForm();
  } else if (
    pageName.includes("results") ||
    document.getElementById(
      "results-container"
    )
  ) {
    renderResultsPage();
  }
})();

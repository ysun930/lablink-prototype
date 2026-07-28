const {
  createClient
} = require("@supabase/supabase-js");

/*
==================================================
HELPERS
==================================================
*/

function parseBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  return req.body || {};
}

function getValue(
  object,
  aliases,
  fallback = null
) {
  for (const alias of aliases) {
    if (
      object?.[alias] !== undefined &&
      object?.[alias] !== null &&
      object?.[alias] !== ""
    ) {
      return object[alias];
    }
  }

  return fallback;
}

function normalizePercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Number(number.toFixed(1))
    )
  );
}

function normalizeResults(body) {
  const results = getValue(
    body,
    [
      "results",
      "matches"
    ],
    []
  );

  if (Array.isArray(results)) {
    return results;
  }

  const singleMatch = getValue(
    body,
    [
      "result",
      "match"
    ]
  );

  return singleMatch
    ? [singleMatch]
    : [];
}

function buildMatchedPairs(result) {
  const existing = getValue(
    result,
    [
      "matched_pairs",
      "matchedPairs"
    ]
  );

  if (
    existing &&
    typeof existing === "object"
  ) {
    return existing;
  }

  return {
    fieldScore: getValue(
      result,
      [
        "fieldScore",
        "field_score"
      ],
      0
    ),

    fieldMax: getValue(
      result,
      [
        "fieldMax",
        "field_max"
      ],
      5
    ),

    techniqueScore: getValue(
      result,
      [
        "techniqueScore",
        "technique_score"
      ],
      0
    ),

    techniqueMax: getValue(
      result,
      [
        "techniqueMax",
        "technique_max"
      ],
      18
    ),

    goalScore: getValue(
      result,
      [
        "goalScore",
        "goal_score"
      ],
      0
    ),

    goalMax: getValue(
      result,
      [
        "goalMax",
        "goal_max"
      ],
      14
    ),

    matchedTechniques: getValue(
      result,
      [
        "matchedTechniques",
        "matched_techniques"
      ],
      []
    ),

    matchedSubDisciplines:
      getValue(
        result,
        [
          "matchedSubDisciplines",
          "matched_sub_disciplines"
        ],
        []
      ),

    whyItMatches: getValue(
      result,
      [
        "whyItMatches",
        "why_it_matches",
        "reasons"
      ],
      []
    ),

    aiAvailable: Boolean(
      getValue(
        result,
        [
          "aiAvailable",
          "ai_available"
        ],
        false
      )
    )
  };
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
    res.setHeader(
      "Allow",
      "POST"
    );

    return res.status(405).json({
      success: false,
      error:
        "Only POST requests are allowed."
    });
  }

  try {
    const supabaseUrl = String(
      process.env.SUPABASE_URL || ""
    ).trim();

    const serviceKey = String(
      process.env.SUPABASE_SERVICE_KEY ||
      ""
    ).trim();

    if (
      !supabaseUrl ||
      !serviceKey
    ) {
      return res.status(500).json({
        success: false,
        error:
          "SUPABASE_URL or SUPABASE_SERVICE_KEY is missing."
      });
    }

    const body =
      parseBody(req);

    const candidateId = String(
      getValue(
        body,
        [
          "candidate_id",
          "candidateId"
        ],
        ""
      )
    ).trim();

    if (!candidateId) {
      return res.status(400).json({
        success: false,
        error:
          "candidate_id is required."
      });
    }

    const results =
      normalizeResults(body);

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "At least one match result is required."
      });
    }

    const rows = [];

    for (const result of results) {
      const labId = String(
        getValue(
          result,
          [
            "labId",
            "lab_id"
          ],
          result.labProfile?.id ||
          result.lab?.id ||
          ""
        )
      ).trim();

      if (!labId) {
        continue;
      }

      rows.push({
        candidate_id:
          candidateId,

        lab_id:
          labId,

        rule_percent:
          normalizePercent(
            getValue(
              result,
              [
                "rulePercent",
                "rule_percent"
              ],
              0
            )
          ),

        semantic_percent:
          normalizePercent(
            getValue(
              result,
              [
                "semanticPercent",
                "semantic_percent"
              ],
              0
            )
          ),

        combined_percent:
          normalizePercent(
            getValue(
              result,
              [
                "combinedPercent",
                "combined_percent"
              ],
              0
            )
          ),

        matched_pairs:
          buildMatchedPairs(result)
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "No result contained a valid lab ID."
      });
    }

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );

    /*
      By default, replace the candidate's
      previous saved match results.
    */
    const replaceExisting =
      body.replace_existing !== false &&
      body.replaceExisting !== false;

    if (replaceExisting) {
      const {
        error: deleteError
      } = await supabase
        .from("matches")
        .delete()
        .eq(
          "candidate_id",
          candidateId
        );

      if (deleteError) {
        console.error(
          "Delete old matches error:",
          deleteError
        );

        return res.status(500).json({
          success: false,
          error:
            deleteError.message
        });
      }
    }

    const {
      data,
      error
    } = await supabase
      .from("matches")
      .insert(rows)
      .select();

    if (error) {
      console.error(
        "Save matches error:",
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,

      message:
        "Match results saved successfully.",

      candidateId,

      savedCount:
        data?.length || 0,

      matches:
        data || []
    });
  } catch (error) {
    console.error(
      "Save match API error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to save match results."
    });
  }
};
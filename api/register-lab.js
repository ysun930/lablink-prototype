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
  body,
  aliases,
  fallback = null
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

function toList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(toList)
      .map(item => String(item).trim())
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

function normalizeLab(body) {
  return {
    user_id: getValue(
      body,
      [
        "user_id",
        "userId"
      ]
    ),

    lab_name: getValue(
      body,
      [
        "lab_name",
        "labName",
        "Lab_Name"
      ],
      ""
    ),

    pi_name: getValue(
      body,
      [
        "pi_name",
        "piName",
        "PI_Name"
      ]
    ),

    institution: getValue(
      body,
      [
        "institution",
        "Institution"
      ]
    ),

    institution_type: getValue(
      body,
      [
        "institution_type",
        "institutionType",
        "Institution_Type"
      ]
    ),

    primary_field: getValue(
      body,
      [
        "primary_field",
        "primaryField",
        "Primary_Field"
      ],
      ""
    ),

    sub_disciplines: toList(
      getValue(
        body,
        [
          "sub_disciplines",
          "subDisciplines",
          "Sub_disciplines"
        ],
        []
      )
    ),

    required_techniques: toList(
      getValue(
        body,
        [
          "required_techniques",
          "requiredTechniques",
          "Required_Techniques"
        ],
        []
      )
    ),

    preferred_techniques: toList(
      getValue(
        body,
        [
          "preferred_techniques",
          "preferredTechniques",
          "Preferred_Techniques"
        ],
        []
      )
    ),

    lab_aim: getValue(
      body,
      [
        "lab_aim",
        "labAim",
        "Lab_Aim"
      ]
    ),

    career_pathways: toList(
      getValue(
        body,
        [
          "career_pathways",
          "careerPathways",
          "Career_Pathways",
          "Career_Pathways_Supported"
        ],
        []
      )
    ),

    hiree_level: toList(
      getValue(
        body,
        [
          "hiree_level",
          "hireeLevel",
          "Hiree_Level",
          "Hiree_Level_Sought"
        ],
        []
      )
    ),

    hours_per_week: getValue(
      body,
      [
        "hours_per_week",
        "hoursPerWeek",
        "Hours_Per_Week"
      ]
    ),

    compensation: getValue(
      body,
      [
        "compensation",
        "Compensation"
      ]
    ),

    remote_option: getValue(
      body,
      [
        "remote_option",
        "remoteOption",
        "work_format",
        "workFormat",
        "Remote_Option"
      ]
    ),

    lab_size: getValue(
      body,
      [
        "lab_size",
        "labSize",
        "Lab_Size"
      ]
    ),

    description: getValue(
      body,
      [
        "description",
        "lab_description",
        "labDescription",
        "Lab_Description",
        "Lab_Description_FreeText"
      ],
      ""
    )
  };
}

function buildLabText(lab) {
  return [
    lab.lab_name,
    lab.pi_name,
    lab.institution,
    lab.institution_type,
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

    ...toList(
      lab.hiree_level
    ),

    lab.description
  ]
    .filter(Boolean)
    .join(". ");
}

/*
==================================================
COHERE EMBEDDING
==================================================
*/

async function createLabEmbedding(text) {
  const cohereKey = String(
    process.env.COHERE_API_KEY || ""
  ).trim();

  if (!cohereKey) {
    return {
      embedding: null,
      warning:
        "COHERE_API_KEY is missing. Lab was saved without an embedding."
    };
  }

  try {
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

          texts: [text],

          input_type:
            "search_document",

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
        `Cohere request failed: ${response.status}`
      );
    }

    const embedding =
      result.embeddings?.float?.[0];

    if (!Array.isArray(embedding)) {
      throw new Error(
        "Cohere returned no embedding."
      );
    }

    return {
      embedding,
      warning: null
    };
  } catch (error) {
    console.warn(
      "Lab embedding was not created:",
      error.message
    );

    /*
      The lab is still saved.
      Phase 5 can generate missing embeddings later.
    */
    return {
      embedding: null,
      warning:
        `Lab saved, but embedding failed: ${error.message}`
    };
  }
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

    const lab =
      normalizeLab(body);

    if (!lab.lab_name) {
      return res.status(400).json({
        success: false,
        error:
          "Lab name is required."
      });
    }

    if (!lab.primary_field) {
      return res.status(400).json({
        success: false,
        error:
          "Primary field is required."
      });
    }

    if (!lab.description) {
      return res.status(400).json({
        success: false,
        error:
          "Lab description is required."
      });
    }

    const labText =
      buildLabText(lab);

    const {
      embedding,
      warning
    } = await createLabEmbedding(
      labText
    );

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

    const labRow = {
      lab_name:
        lab.lab_name,

      pi_name:
        lab.pi_name,

      institution:
        lab.institution,

      institution_type:
        lab.institution_type,

      primary_field:
        lab.primary_field,

      sub_disciplines:
        lab.sub_disciplines,

      required_techniques:
        lab.required_techniques,

      preferred_techniques:
        lab.preferred_techniques,

      lab_aim:
        lab.lab_aim,

      career_pathways:
        lab.career_pathways,

      hiree_level:
        lab.hiree_level,

      hours_per_week:
        lab.hours_per_week,

      compensation:
        lab.compensation,

      remote_option:
        lab.remote_option,

      lab_size:
        lab.lab_size,

      description:
        lab.description,

      description_embedding:
        embedding
    };

    /*
      user_id is optional until
      authentication is connected.
    */
    if (lab.user_id) {
      labRow.user_id =
        lab.user_id;
    }

    const {
      data,
      error
    } = await supabase
      .from("labs")
      .insert(labRow)
      .select()
      .single();

    if (error) {
      console.error(
        "Supabase lab insert error:",
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
        "Lab registered successfully.",

      embeddingCreated:
        Array.isArray(embedding),

      warning,

      lab: data
    });
  } catch (error) {
    console.error(
      "Register lab API error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to register lab."
    });
  }
};
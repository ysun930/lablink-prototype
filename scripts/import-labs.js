const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local")
});

const supabaseUrl = String(
  process.env.SUPABASE_URL || ""
).trim();

const serviceKey = String(
  process.env.SUPABASE_SERVICE_KEY || ""
).trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local."
  );
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  serviceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const labsPath = path.join(
  __dirname,
  "..",
  "data",
  "labs.json"
);

if (!fs.existsSync(labsPath)) {
  console.error(
    "Could not find data/labs.json."
  );
  process.exit(1);
}

const fileContent = JSON.parse(
  fs.readFileSync(labsPath, "utf8")
);

const labs = Array.isArray(fileContent)
  ? fileContent
  : fileContent.labs;

if (!Array.isArray(labs)) {
  console.error(
    "data/labs.json must contain an array of labs."
  );
  process.exit(1);
}

function toArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (
          item &&
          typeof item === "object"
        ) {
          return (
            item.skill ||
            item.name ||
            item.technique ||
            item.value ||
            ""
          );
        }

        return String(item).trim();
      })
      .filter(Boolean);
  }

  return String(value)
    .split(/[,;|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeLab(lab) {
  return {
    lab_name:
      lab.Lab_Name ||
      lab.lab_name ||
      lab.Name ||
      "Unnamed Laboratory",

    pi_name:
      lab.PI_Name ||
      lab.pi_name ||
      null,

    institution:
      lab.Institution ||
      lab.institution ||
      null,

    institution_type:
      lab.Institution_Type ||
      lab.institution_type ||
      null,

    primary_field:
      lab.Primary_Field ||
      lab.primary_field ||
      null,

    sub_disciplines: toArray(
      lab.Sub_disciplines ||
      lab.Sub_Disciplines ||
      lab.sub_disciplines
    ),

    required_techniques: toArray(
      lab.Required_Techniques ||
      lab.Required_Skills ||
      lab.required_techniques
    ),

    preferred_techniques: toArray(
      lab.Preferred_Techniques ||
      lab.Preferred_Skills ||
      lab.preferred_techniques
    ),

    lab_aim:
      lab.Lab_Aim ||
      lab.lab_aim ||
      null,

    career_pathways: toArray(
      lab.Career_Pathways ||
      lab.Career_Pathways_Supported ||
      lab.career_pathways
    ),

    hiree_level: toArray(
      lab.Hiree_Level ||
      lab.Hiree_Level_Sought ||
      lab.hiree_level
    ),

    hours_per_week:
      lab.Hours_Per_Week ||
      lab.hours_per_week ||
      null,

    compensation:
      lab.Compensation ||
      lab.compensation ||
      null,

    remote_option:
      lab.Remote_Option ||
      lab.remote_option ||
      null,

    lab_size:
      lab.Lab_Size ||
      lab.lab_size ||
      null,

    description:
      lab.Lab_Description_FreeText ||
      lab.Lab_Description ||
      lab.Description ||
      lab.description ||
      null
  };
}

async function importLabs() {
  const {
    data: existingLabs,
    error: readError
  } = await supabase
    .from("labs")
    .select("lab_name");

  if (readError) {
    throw readError;
  }

  const existingNames = new Set(
    (existingLabs || []).map(
      lab => lab.lab_name
    )
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const rawLab of labs) {
    const lab = normalizeLab(rawLab);

    if (existingNames.has(lab.lab_name)) {
      console.log(
        `Skipped: ${lab.lab_name}`
      );

      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("labs")
      .insert(lab);

    if (error) {
      console.error(
        `Failed: ${lab.lab_name} — ${error.message}`
      );

      failed++;
      continue;
    }

    console.log(
      `Imported: ${lab.lab_name}`
    );

    existingNames.add(lab.lab_name);
    imported++;
  }

  console.log("");
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

importLabs().catch(error => {
  console.error(
    "Import failed:",
    error.message
  );

    process.exit(1);
});
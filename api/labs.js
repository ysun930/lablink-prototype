const {
  createClient
} = require("@supabase/supabase-js");

/*
  GET /api/labs
  Returns every lab from Supabase.

  GET /api/labs?id=LAB_UUID
  Returns one specific lab.
*/

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      error: "Only GET requests are allowed."
    });
  }

  try {
    const supabaseUrl = String(
      process.env.SUPABASE_URL || ""
    ).trim();

    const supabaseAnonKey = String(
      process.env.SUPABASE_ANON_KEY || ""
    ).trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({
        success: false,
        error:
          "SUPABASE_URL or SUPABASE_ANON_KEY is missing."
      });
    }

    /*
      The publishable/anon key respects the
      read_labs Row Level Security policy.
    */
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );

    const labId = String(
      req.query?.id || ""
    ).trim();

    const columns = `
      id,
      lab_name,
      pi_name,
      institution,
      institution_type,
      primary_field,
      sub_disciplines,
      required_techniques,
      preferred_techniques,
      lab_aim,
      career_pathways,
      hiree_level,
      hours_per_week,
      compensation,
      remote_option,
      lab_size,
      description,
      created_at
    `;

    /*
      Return one lab when an id is supplied.
    */
    if (labId) {
      const {
        data: lab,
        error
      } = await supabase
        .from("labs")
        .select(columns)
        .eq("id", labId)
        .maybeSingle();

      if (error) {
        console.error(
          "Supabase lab lookup error:",
          error
        );

        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      if (!lab) {
        return res.status(404).json({
          success: false,
          error: "Lab not found."
        });
      }

      return res.status(200).json({
        success: true,
        lab
      });
    }

    /*
      Return all labs.
      The embedding column is intentionally excluded.
    */
    const {
      data: labs,
      error
    } = await supabase
      .from("labs")
      .select(columns)
      .order("lab_name", {
        ascending: true
      });

    if (error) {
      console.error(
        "Supabase labs query error:",
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      totalLabs: labs?.length || 0,
      labs: labs || []
    });
  } catch (error) {
    console.error(
      "Labs API error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to load labs."
    });
  }
};
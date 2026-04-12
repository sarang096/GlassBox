// ═══════════════════════════════════════════
// API Proxy: GET /api/scores
// Forwards to n8n /webhook/scores to fetch candidate scores
// Query params: group_id, candidate_name
// Header: x-admin-key (from env ADMIN_SECRET)
// ═══════════════════════════════════════════

import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const group_id = searchParams.get("group_id");
    const candidate_name = searchParams.get("candidate_name");

    if (!group_id || !candidate_name) {
      return NextResponse.json(
        { error: "group_id and candidate_name are required" },
        { status: 400 }
      );
    }

    const N8N_URL = process.env.N8N_WEBHOOK_URL;
    if (!N8N_URL) {
      return NextResponse.json({ error: "N8N not configured" }, { status: 503 });
    }

    const targetUrl = `${N8N_URL}/scores?group_id=${encodeURIComponent(group_id)}&candidate_name=${encodeURIComponent(candidate_name)}`;
    console.log(`[scores] → GET ${targetUrl}`);

    const adminSecret = process.env.ADMIN_SECRET || "change-me";

    const n8nResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "x-admin-key": adminSecret,
      },
    });

    const responseText = await n8nResponse.text();
    console.log(`[scores] ← ${n8nResponse.status}: ${responseText.substring(0, 300)}`);

    if (!n8nResponse.ok) {
      return NextResponse.json(
        { found: false, message: "Could not fetch scores" },
        { status: n8nResponse.status }
      );
    }

    let data = {};
    try { data = JSON.parse(responseText); } catch { data = { found: false }; }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[scores] Error:", error.message);
    return NextResponse.json({ found: false, error: error.message }, { status: 500 });
  }
}

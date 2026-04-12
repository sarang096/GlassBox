// ═══════════════════════════════════════════
// API Proxy: POST /api/init-session
// Forwards { group_id, codebase } to n8n
// to register the reference codebase for the AI Tutor
// ═══════════════════════════════════════════

import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { group_id, codebase } = body;

    if (!group_id || !codebase) {
      return NextResponse.json(
        { error: "group_id and codebase are required" },
        { status: 400 }
      );
    }

    const N8N_URL = process.env.N8N_WEBHOOK_URL;
    if (!N8N_URL) {
      console.error("[init-session] N8N_WEBHOOK_URL not configured");
      return NextResponse.json({ error: "N8N not configured" }, { status: 503 });
    }

    const targetUrl = `${N8N_URL}/init-session`;
    console.log(`[init-session] → POST ${targetUrl} for group ${group_id}`);

    const n8nResponse = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id, codebase }),
    });

    const responseText = await n8nResponse.text();
    console.log(`[init-session] ← ${n8nResponse.status}: ${responseText.substring(0, 200)}`);

    if (!n8nResponse.ok) {
      return NextResponse.json({ error: "Failed to init session" }, { status: 502 });
    }

    let data = {};
    try { data = JSON.parse(responseText); } catch { data = { ok: true }; }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[init-session] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

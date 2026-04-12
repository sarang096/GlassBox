// ═══════════════════════════════════════════
// API Proxy: POST /api/chat
// Forwards { group_id, candidate_name, message }
// to the n8n webhook and returns { reply }
// ═══════════════════════════════════════════

import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { group_id, candidate_name, message } = body;

    // Validate required fields
    if (!group_id || !candidate_name || !message) {
      return NextResponse.json(
        { error: "group_id, candidate_name, and message are required" },
        { status: 400 }
      );
    }

    const N8N_URL = process.env.N8N_WEBHOOK_URL;
    if (!N8N_URL) {
      console.error("[chat-proxy] N8N_WEBHOOK_URL is not configured in .env.local");
      return NextResponse.json(
        { reply: "AI Tutor service is not configured. Set N8N_WEBHOOK_URL in .env.local" },
        { status: 503 }
      );
    }

    const targetUrl = `${N8N_URL}/chat`;
    console.log(`[chat-proxy] → POST ${targetUrl}`);

    // Forward to n8n /chat webhook
    const n8nResponse = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id, candidate_name, message }),
    });

    console.log(`[chat-proxy] ← n8n status: ${n8nResponse.status}`);

    // Read response as text first (handles empty body gracefully)
    const responseText = await n8nResponse.text();
    console.log(`[chat-proxy] ← n8n body: ${responseText.substring(0, 500)}`);

    if (!n8nResponse.ok) {
      console.error(`[chat-proxy] n8n error ${n8nResponse.status}: ${responseText}`);
      return NextResponse.json(
        { reply: "The AI Tutor is temporarily unavailable. Please try again in a moment." },
        { status: 502 }
      );
    }

    // Handle empty response body
    if (!responseText || responseText.trim() === "") {
      console.warn("[chat-proxy] n8n returned 200 but with EMPTY body. Check n8n workflow — the 'Respond to Webhook' node may not be returning JSON.");
      return NextResponse.json({
        reply: "I received your message, but the AI service returned an empty response. Please make sure the n8n workflow has Supabase credentials configured and the 'Respond to Webhook' node is active.",
      });
    }

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`[chat-proxy] Failed to parse n8n response as JSON: ${responseText.substring(0, 200)}`);
      return NextResponse.json({
        reply: "The AI service returned an unexpected response format. Check the n8n workflow logs.",
      });
    }

    return NextResponse.json({
      reply: data.reply || "I couldn't form a response. Could you rephrase?",
    });

  } catch (error) {
    // Network errors (ECONNREFUSED, timeout, etc.)
    console.error("[chat-proxy] Connection error:", error.message);
    return NextResponse.json(
      {
        reply: `Cannot reach the AI Tutor service. Make sure n8n is running. Error: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

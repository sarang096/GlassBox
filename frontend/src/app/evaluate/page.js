"use client";

import "./evaluate.css";
import CodeEditor from "@/components/CodeEditor";
import TutorChat from "@/components/TutorChat";

// ── Hardcoded test values ──
// n8n keys sessions and scores on the group_code, so this must be a code
// (from the groups table), not the numeric id.
const GROUP_CODE = "JYE7LZEO";
const USERNAME = "Sarang";

export default function EvaluatePage() {
  return (
    <main className="eval-room" id="evaluation-room">
      {/* Left Panel: Code Editor — 70% */}
      <CodeEditor />

      {/* Right Panel: AI Tutor Chat — 30% */}
      <TutorChat groupCode={GROUP_CODE} username={USERNAME} />
    </main>
  );
}

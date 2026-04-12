"use client";

import "./evaluate.css";
import CodeEditor from "@/components/CodeEditor";
import TutorChat from "@/components/TutorChat";

// ── Hardcoded test values ──
const GROUP_ID = "test_group_01";
const CANDIDATE_NAME = "Sarang";

export default function EvaluatePage() {
  return (
    <main className="eval-room" id="evaluation-room">
      {/* Left Panel: Code Editor — 70% */}
      <CodeEditor />

      {/* Right Panel: AI Tutor Chat — 30% */}
      <TutorChat groupId={GROUP_ID} candidateName={CANDIDATE_NAME} />
    </main>
  );
}

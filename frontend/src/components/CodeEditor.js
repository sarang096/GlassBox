"use client";

import { useState, useRef, useCallback } from "react";

const INITIAL_CODE = `def two_sum(nums, target):
    """
    Given an array of integers nums and an integer target,
    return indices of the two numbers that add up to target.
    
    Example:
      two_sum([2, 7, 11, 15], 9)  →  [0, 1]
    """
    seen = {}
    for i, num in enumerate(nums):
        complement = target + num        # ← BUG: should be target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []


# ── Quick smoke test ──
print(two_sum([2, 7, 11, 15], 9))   # Expected: [0, 1]
print(two_sum([3, 2, 4], 6))        # Expected: [1, 2]
print(two_sum([3, 3], 6))           # Expected: [0, 1]
`;

export default function CodeEditor() {
  const [code, setCode] = useState(INITIAL_CODE);
  const textareaRef = useRef(null);

  const lineCount = code.split("\n").length;

  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const lineNumbers = document.getElementById("eval-line-nums");
    if (textarea && lineNumbers) {
      lineNumbers.scrollTop = textarea.scrollTop;
    }
  }, []);

  return (
    <div className="eval-editor-panel">
      {/* ── Header / Toolbar ── */}
      <div className="eval-editor-header">
        <div className="eval-editor-tab">
          <span className="eval-file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
          </span>
          <span className="eval-filename">challenge.py</span>
          <span className="eval-file-dot" title="Unsaved changes" />
        </div>

        <button className="eval-run-btn" id="run-tests-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Run Tests
        </button>
      </div>

      {/* ── Editor Body ── */}
      <div className="eval-editor-body">
        <div className="eval-line-numbers" id="eval-line-nums">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className={i === 12 ? "active-line" : ""}>
              {i + 1}
            </div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          id="code-editor-textarea"
          className="eval-textarea"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          data-gramm="false"
          wrap="off"
        />
      </div>

      {/* ── Status Bar ── */}
      <div className="eval-editor-statusbar">
        <div className="eval-statusbar-left">
          <span className="eval-statusbar-item">
            <span className="eval-statusbar-dot" />
            Ready
          </span>
          <span className="eval-statusbar-item">Ln {lineCount}, Col 1</span>
        </div>
        <div className="eval-statusbar-right">
          <span className="eval-statusbar-item">Python 3.11</span>
          <span className="eval-statusbar-item">UTF-8</span>
          <span className="eval-statusbar-item">Spaces: 4</span>
        </div>
      </div>
    </div>
  );
}

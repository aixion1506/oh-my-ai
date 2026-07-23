#!/usr/bin/env node

import fs from "node:fs";

const args = process.argv.slice(2);
const runtimeIndex = args.indexOf("--runtime");
const skillIndex = args.indexOf("--skill");
const runtime = runtimeIndex >= 0 ? args[runtimeIndex + 1] : "";
const skill = skillIndex >= 0 ? args[skillIndex + 1] : "";

const contracts = {
  claude: {
    heading: "## Claude Code Runtime Entry",
    markers: [
      "version = 1",
      "runtime = claude",
      'public_entry = "$HOME/.local/bin/oh-my-ai" work-start -- "<single task argument>"',
    ],
  },
  codex: {
    heading: "## Codex Runtime Entry",
    markers: [
      "version = 1",
      "runtime = codex",
      'public_entry = "$HOME/.local/bin/oh-my-ai" work-start -- "<single task argument>"',
    ],
  },
};

if (!contracts[runtime] || !skill || args.length !== 4) {
  process.exit(2);
}

let content;
try {
  content = fs.readFileSync(skill, "utf8");
} catch {
  process.exit(1);
}

const { heading, markers } = contracts[runtime];
const headingStart = content.indexOf(`${heading}\n`);
if (headingStart < 0) process.exit(1);

const sectionStart = headingStart + heading.length + 1;
const sectionEnd = content.indexOf("\n## ", sectionStart);
const section = content.slice(sectionStart, sectionEnd < 0 ? content.length : sectionEnd);
const blocks = [...section.matchAll(/```oh-my-ai-work-start-contract\r?\n([\s\S]*?)\r?\n```/g)];
if (blocks.length !== 1) process.exit(1);
const lines = blocks[0][1].split(/\r?\n/);
if (lines.length !== markers.length || !lines.every((line, index) => line === markers[index])) process.exit(1);

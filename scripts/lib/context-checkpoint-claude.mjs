import {
  checkpointStatus,
  notifyUnresolvedCheckpoint,
  recordCheckpointActivity,
} from "./context-checkpoint-state.mjs";

const FILE_MUTATION_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export function handleClaudeCheckpointHook(eventName, rawInput, options = {}) {
  const event = parseEvent(rawInput);
  if (!event || event.hook_event_name !== eventName) {
    return unavailableOutput(eventName, "hook_payload_unavailable");
  }

  if (eventName === "PostToolUse") {
    return handlePostToolUse(event, options);
  }
  if (eventName === "SessionEnd") {
    const status = checkpointStatus({
      cwd: event.cwd,
      env: options.env,
    });
    return status.availability === "available"
      ? {}
      : unavailableOutput(eventName, status.reason_code);
  }
  if (eventName === "SessionStart") {
    const notification = notifyUnresolvedCheckpoint({
      cwd: event.cwd,
      runtime: "claude",
      sessionId: event.session_id,
      boundaryKind: "SessionStart",
      env: options.env,
    });
    if (notification.availability !== "available") {
      return unavailableOutput(eventName, notification.reason_code);
    }
    if (!notification.notify) return {};
    return {
      systemMessage: unresolvedMessage(notification.prior_unresolved_count),
      additionalContext: unresolvedMessage(notification.prior_unresolved_count),
    };
  }
  return unavailableOutput(eventName, "unsupported_hook_event");
}

function handlePostToolUse(event, options) {
  const signalKind = activitySignal(event);
  if (!signalKind) return {};
  const result = recordCheckpointActivity({
    cwd: event.cwd,
    runtime: "claude",
    sessionId: event.session_id,
    eventId: event.tool_use_id,
    signalKind,
    env: options.env,
  });
  return result.availability === "available"
    ? {}
    : unavailableOutput("PostToolUse", result.reason_code);
}

function activitySignal(event) {
  if (FILE_MUTATION_TOOLS.has(event.tool_name)) return "file_mutation";
  if (event.tool_name !== "Bash") return "";
  const command = typeof event.tool_input?.command === "string"
    ? event.tool_input.command
    : "";
  return isValidationCommand(command) ? "validation_run" : "";
}

function isValidationCommand(command) {
  if (!command || command.length > 64 * 1024) return false;
  return /(?:^|&&|\|\||;|\n)\s*(?:make\s+test(?:[-A-Za-z0-9_]*)?\b|npm\s+(?:run\s+)?test\b|pnpm\s+(?:run\s+)?test\b|yarn\s+test\b|node\s+--test\b|pytest\b|python(?:3)?\s+-m\s+pytest\b|go\s+test\b|cargo\s+test\b|mvnw?\s+.*\btest\b|gradlew?\s+.*\btest\b)/m.test(command);
}

function parseEvent(rawInput) {
  try {
    const parsed = JSON.parse(String(rawInput || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function unavailableOutput(eventName, reasonCode) {
  const message = [
    "Context Checkpoint 상태를 확인할 수 없습니다.",
    `availability: unavailable (${reasonCode || "unknown"})`,
    "현재 작업은 계속할 수 있으며, 필요하면 Manual Context Checkpoint를 진행하세요.",
  ].join("\n");
  return {
    systemMessage: message,
    ...(eventName === "SessionStart" ? { additionalContext: message } : {}),
  };
}

function unresolvedMessage(unresolvedCount) {
  return [
    "이전 작업 구간에서 Project Context 검토가 완료되지 않았습니다.",
    Number.isInteger(unresolvedCount)
      ? `미해결 Context Checkpoint: ${unresolvedCount}개`
      : "",
    "",
    "선택:",
    "- Context Checkpoint 진행",
    "- 이번에는 no_update",
    "- 현재 작업을 계속하고 나중에 검토",
    "",
    "기본 선택은 없습니다. 마지막 선택은 해결 상태가 아니며 review_needed가 유지됩니다.",
  ].filter((line, index, lines) => line || lines[index - 1] !== "").join("\n");
}

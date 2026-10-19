import type { SharedState } from "../../server/src/runtime.js";
type Challenge = SharedState["challenges"][number];
export function currentChallenge(challenges: Challenge[]) {
  const express = challenges.filter(
    (c) => c.type === "timed_good_production" && c.status !== "cancelled",
  );
  return (
    express.find((c) => c.status === "active") ??
    express.find((c) => c.status === "awaiting_validation") ??
    express.find((c) => c.status === "ready") ??
    express.at(-1)
  );
}

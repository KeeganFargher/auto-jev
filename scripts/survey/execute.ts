import { runBattleJob } from "./battles.js";
import { loadCatalogue } from "./catalogues.js";
import { playRun } from "./runs.js";
import type { WorkerReply, WorkerTask } from "./types.js";

export function executeTask(task: WorkerTask): WorkerReply {
  const catalogue = loadCatalogue();

  if (task.kind === "battles") {
    return { kind: "battles", results: task.jobs.map((job) => runBattleJob(job, catalogue)) };
  }

  return { kind: "runs", results: task.jobs.map((job) => playRun(job, catalogue)) };
}

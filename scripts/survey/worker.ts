import { parentPort } from "node:worker_threads";
import { executeTask } from "./execute.js";
import type { WorkerReply, WorkerTask } from "./types.js";

const port = parentPort;

if (port === null) {
  throw new Error("survey worker started outside a worker thread");
}

port.on("message", (task: WorkerTask) => {
  let reply: WorkerReply;

  try {
    reply = executeTask(task);
  } catch (error) {
    reply = { kind: "error", message: error instanceof Error ? (error.stack ?? error.message) : String(error) };
  }

  port.postMessage(reply);
});

const ready: WorkerReply = { kind: "ready" };

port.postMessage(ready);

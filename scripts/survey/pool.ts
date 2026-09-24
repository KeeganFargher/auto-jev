import { Worker } from "node:worker_threads";
import { executeTask } from "./execute.js";
import type { WorkerReply, WorkerTask } from "./types.js";

export type ProgressListener = (done: number, total: number) => void;

function runInProcess(tasks: readonly WorkerTask[], onProgress: ProgressListener): WorkerReply[] {
  const replies: WorkerReply[] = [];

  for (const task of tasks) {
    replies.push(executeTask(task));
    onProgress(replies.length, tasks.length);
  }

  return replies;
}

function runOnWorkers(tasks: readonly WorkerTask[], threads: number, onProgress: ProgressListener): Promise<WorkerReply[]> {
  const replies = new Map<number, WorkerReply>();
  const bootUrl = new URL("./boot.mjs", import.meta.url);
  const entry = new URL("./worker.ts", import.meta.url).href;
  let nextIndex = 0;

  const workerCount = Math.max(1, Math.min(threads, tasks.length));

  const lanes = Array.from(
    { length: workerCount },
    () =>
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(bootUrl, { workerData: { entry } });
        let currentIndex = -1;

        worker.on("message", (reply: WorkerReply) => {
          if (reply.kind === "error") {
            void worker.terminate();
            reject(new Error(reply.message));

            return;
          }

          if (reply.kind !== "ready") {
            replies.set(currentIndex, reply);
            onProgress(replies.size, tasks.length);
          }

          if (nextIndex >= tasks.length) {
            void worker.terminate();
            resolve();

            return;
          }

          currentIndex = nextIndex;
          nextIndex += 1;
          worker.postMessage(tasks[currentIndex]);
        });

        worker.on("error", reject);
      }),
  );

  return Promise.all(lanes).then(() =>
    tasks.map((_, index) => {
      const reply = replies.get(index);

      if (reply === undefined) {
        throw new Error(`survey task ${index} produced no reply`);
      }

      return reply;
    }),
  );
}

export async function runTasks(
  tasks: readonly WorkerTask[],
  threads: number,
  onProgress: ProgressListener,
): Promise<WorkerReply[]> {
  if (tasks.length === 0) {
    return [];
  }

  if (threads <= 1) {
    return runInProcess(tasks, onProgress);
  }

  return runOnWorkers(tasks, threads, onProgress);
}

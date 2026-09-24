import { workerData } from "node:worker_threads";
import { register } from "tsx/esm/api";

register();

await import(workerData.entry);

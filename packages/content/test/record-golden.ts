import { recordGolden, writeGolden } from "./golden.js";

const digests = recordGolden();

writeGolden(digests);

console.log(`Recorded ${digests.length} golden digests`);

import "./style.css";
import { ColyseusSDK, Callbacks, Predict } from "@colyseus/sdk";
import { stepEntity, type MoveInputLike } from "@jev-game/shared";
import type { GameServer } from "@jev-game/server-runtime/contract";

// The server runs as its own process (apps/server, port 2567 by default —
// see apps/server/src/index.ts) rather than sharing this app's origin, so
// the endpoint has to be explicit. Override per environment with
// VITE_COLYSEUS_ENDPOINT (e.g. in apps/client/.env.production).
const endpoint = import.meta.env.VITE_COLYSEUS_ENDPOINT ?? "http://localhost:2567";

const statusEl = document.getElementById("status")!;

const arenaEl = document.getElementById("arena")!;

const client = new ColyseusSDK<GameServer>(endpoint);

const held = new Set<string>();

addEventListener("keydown", (e) => held.add(e.key.toLowerCase()));

addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));

/** Opposite keys cancel out, so the axis is always exactly -1, 0 or 1. */
function axis(negative: string[], positive: string[]): -1 | 0 | 1 {
  const back = negative.some((k) => held.has(k));
  const forward = positive.some((k) => held.has(k));

  if (back === forward) {
    return 0;
  }

  return back ? -1 : 1;
}

async function main() {
  const room = await client.joinOrCreate("arena");
  const predict = Predict.get(room);

  // Other players' inputs aren't ours to predict: interpolate them toward the
  // latest snapshot instead. `smoothMs` springs the interpolated output — ~65 ms
  // of extra display lag buys velocity that stays continuous even when the
  // snapshot stream is rough. Use 0 where draw == hit precision matters most.
  predict.attachAll("players", { mode: "lerp", fields: ["x", "y"], smoothMs: 65 });

  const input = room.input<MoveInputLike>({ mode: "reliable" });

  // The first patch is what creates our own Player.
  await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
  const self = room.state.players.get(room.sessionId);

  if (self === undefined)
    throw new Error(`no Player for own sessionId ${room.sessionId} after first state patch`);

  predict.reconciler(self, {
    input,
    fields: ["x", "y", "vx", "vy"],
    // The same function the server runs — determinism is the whole contract.
    step: (ctx, predicted, command) => stepEntity(predicted, command, ctx.dt),
  });

  statusEl.textContent = `Connected as ${room.sessionId}`;

  const nodes = new Map<string, HTMLElement>();
  const callbacks = Callbacks.get(room);

  callbacks.onAdd("players", (_player, key) => {
    // SAFETY: MapSchema keys are always strings on the wire; the callback
    // signature widens it to `string | number` to also cover ArraySchema.
    const sessionId = key as string;
    const node = document.createElement("div");
    node.className = sessionId === room.sessionId ? "player self" : "player";
    arenaEl.appendChild(node);
    nodes.set(sessionId, node);
  });

  callbacks.onRemove("players", (_player, key) => {
    // SAFETY: MapSchema keys are always strings on the wire; the callback
    // signature widens it to `string | number` to also cover ArraySchema.
    const sessionId = key as string;
    nodes.get(sessionId)?.remove();
    nodes.delete(sessionId);
  });

  room.onLeave(() => {
    statusEl.textContent = "Disconnected";
    nodes.forEach((node) => node.remove());
    nodes.clear();
  });

  function frame(now: number) {
    // Drives prediction, interpolation and the reconciler, and returns how many
    // fixed steps came due — so input rate follows the simulation rate, not the
    // monitor's refresh rate.
    const steps = predict.tick(now);

    for (let i = 0; i < steps; i++) {
      input.data.moveX = axis(["a", "arrowleft"], ["d", "arrowright"]);
      input.data.moveY = axis(["w", "arrowup"], ["s", "arrowdown"]);
      input.send();
    }

    for (const [sessionId, player] of room.state.players) {
      const node = nodes.get(sessionId);

      if (!node) {
        continue;
      }

      // Predicted for us, interpolated for everyone else — one read either way.
      node.style.transform = `translate(${predict.value(player, "x")}px, ${predict.value(player, "y")}px)`;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  statusEl.textContent = "Could not connect";
});

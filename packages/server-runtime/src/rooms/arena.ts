import { schema, t, type SchemaType } from "@colyseus/schema";
import { Room, type Client, type CloseCode, type StepContext } from "colyseus";
import { stepEntity, TICK_RATE, ARENA_WIDTH, ARENA_HEIGHT } from "@jev-game/shared";

/**
 * One input frame, consumed by `Room.defineInput()`. Flat primitives only, and
 * deliberately minimal:
 *   - no `seq`  — the engine's input counter is the sequence
 *   - no `dt`   — fixed timestep: one input advances exactly one step
 *   - no time   — the SDK stamps lag-comp timing on the wire envelope
 *
 * `int8<-1 | 0 | 1>` narrows the type for your code; the room's `sanitize`
 * clamp is what actually enforces it against a modified client.
 */
export const MoveInput = schema({
  moveX: t.int8<-1 | 0 | 1>(),
  moveY: t.int8<-1 | 0 | 1>(),
});

export type MoveInput = SchemaType<typeof MoveInput>;

export const Player = schema({
  x: t.number(),
  y: t.number(),
  vx: t.number(),
  vy: t.number(),
});

export type Player = SchemaType<typeof Player>;

export const ArenaState = schema({
  players: t.map(Player),
});

export type ArenaState = SchemaType<typeof ArenaState>;

export class Arena extends Room<{ state: ArenaState; input: MoveInput }> {
  override maxClients = 8;
  override state = new ArenaState();

  /**
   * Per-client input buffer. `sanitize` clamps every field as it is decoded —
   * never trust the wire — and the buffer holds ~2s of inputs at this tick rate
   * so a burst after a stall still replays in order.
   */
  override inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: { moveX: [-1, 1], moveY: [-1, 1] },
  });

  private joinCount = 0;

  override messages = {
    // movement arrives through the input buffer above — register handlers here
    // only for things that are not inputs (chat, emotes, …).
  };

  override onCreate(_options: any) {
    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE);
  }

  override onJoin(client: Client, _options: any) {
    console.log(client.sessionId, "joined!");

    // Deterministic spawn ring, so two players never start on top of each other.
    const angle = this.joinCount++ * 2.399963;
    this.state.players.set(
      client.sessionId,
      new Player({
        x: ARENA_WIDTH / 2 + Math.cos(angle) * 80,
        y: ARENA_HEIGHT / 2 + Math.sin(angle) * 80,
        vx: 0,
        vy: 0,
      }),
    );
  }

  override onLeave(client: Client, code: CloseCode) {
    console.log(client.sessionId, "left!", code);
    this.state.players.delete(client.sessionId);
  }

  override onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  /**
   * One shared `stepEntity` per received input, so the set the client predicted
   * is exactly the set the server applied. A client that sends nothing simply
   * does not move — an empty tick advances no one.
   */
  private step(ctx: StepContext) {
    for (const [sessionId, player] of this.state.players) {
      const channel = this.inputs.get(sessionId);

      if (!channel) {
        continue;
      }

      for (const input of channel) {
        stepEntity(player, input, ctx.dt);
      }
    }
  }

  /**
   * Called on any disconnection the client did not ask for — a network blip, a
   * suspended tab, a tunnel change. Holding the seat lets the SDK retry into the
   * same session, so the player keeps their entity and their place in the room.
   */
  override onDrop(client: Client, _code: CloseCode) {
    // Deliberately not awaited: the framework routes the outcome to onReconnect()
    // or onLeave() by itself. The catch is only here because the promise also
    // rejects when the room is already disposing (server shutdown), which would
    // otherwise surface as an unhandled rejection.
    this.allowReconnection(client, 30).catch(() => {});
  }

  override onReconnect(client: Client) {
    console.log(client.sessionId, "reconnected!");
  }
}

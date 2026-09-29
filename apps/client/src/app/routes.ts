export type Route =
  | { kind: "lab" }
  | { kind: "match"; joinRoomId: string | null }
  | { kind: "environment"; themeId: string | null };

export const LAB_HASH = "#lab";

export const MATCH_HASH = "#match";

export const ENVIRONMENT_HASH = "#env";

const JOIN_PREFIX = "#join/";

const ENVIRONMENT_PREFIX = `${ENVIRONMENT_HASH}/`;

export function environmentHash(themeId: string): string {
  return `${ENVIRONMENT_PREFIX}${themeId}`;
}

export function joinHash(roomId: string): string {
  return `${JOIN_PREFIX}${roomId}`;
}

export function parseRoute(hash: string): Route {
  if (hash.startsWith(JOIN_PREFIX)) {
    const joinRoomId = hash.slice(JOIN_PREFIX.length);

    if (joinRoomId === "") {
      throw new Error(`Join link "${hash}" is missing a room id`);
    }

    return { kind: "match", joinRoomId };
  }

  if (hash === MATCH_HASH) {
    return { kind: "match", joinRoomId: null };
  }

  if (hash === ENVIRONMENT_HASH) {
    return { kind: "environment", themeId: null };
  }

  if (hash.startsWith(ENVIRONMENT_PREFIX)) {
    const themeId = hash.slice(ENVIRONMENT_PREFIX.length);

    return { kind: "environment", themeId: themeId === "" ? null : themeId };
  }

  return { kind: "lab" };
}

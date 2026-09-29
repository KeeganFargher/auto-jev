import type { AudioEngine } from "../../../audio/engine.js";
import {
  joinFailureMessage,
  saveResumeToken,
  savedResumeToken,
} from "../../../network/connect-room.js";
import type { NavigationStore } from "../../../app/navigation.js";
import { MATCH_HASH } from "../../../app/routes.js";
import { createOnlineSession } from "../../../session/online-session.js";
import type { MatchServices } from "./match-controller.js";

export function browserMatchServices(
  audio: AudioEngine,
  navigation: NavigationStore,
): MatchServices {
  return {
    audio,
    connect: createOnlineSession,
    confirmLeave: (message) => window.confirm(message),
    resumeToken: {
      read: savedResumeToken,
      clear: () => saveResumeToken(null),
    },
    describeFailure: joinFailureMessage,
    joinLink: {
      consume: () => navigation.replaceHash(MATCH_HASH),
    },
  };
}

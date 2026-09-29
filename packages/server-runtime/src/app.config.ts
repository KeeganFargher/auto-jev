import { defineServer, defineRoom, monitor, playground } from "colyseus";

import { MATCH_ROOM_NAME } from "@jev-game/protocol";
import { MatchRoom } from "./rooms/match-room.js";

const server = defineServer({
  rooms: {
    [MATCH_ROOM_NAME]: defineRoom(MatchRoom),
  },

  express: (app) => {
    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
      app.use("/playground", playground());
    }
  },
});

export default server;

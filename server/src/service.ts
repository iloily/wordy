// The one RPC the client calls. `action` picks the handler, `payload` is JSON.
// Who's asking always comes from Root's Client, never from the payload.

import { Client } from "@rootsdk/server-app";
import { ActRequest, ActResponse } from "@wordy/gen-shared";
import { WordyServiceBase } from "@wordy/gen-server";
import { Handler, dispatch } from "./actions";

export class WordyService extends WordyServiceBase {
  table: Record<string, Handler> = {};

  async act(request: ActRequest, client: Client): Promise<ActResponse> {
    return dispatch(this.table, { userId: client.userId }, request.action, request.payload);
  }
}

import { rootServer, RootAppStartState } from "@rootsdk/server-app";
import { WordyService } from "./service";
import { handlers, cleanName, Names } from "./actions";
import { Backend, MemoryBackend, Who } from "./backend";
import { SupabaseBackend } from "./supabase";
import { Store } from "./store";
import { Wordy } from "./wordy";
import { SUPABASE_KEY, SUPABASE_URL, WORDY_SEED } from "./config";

const kv: Store = {
  get: (key) => rootServer.dataStore.appData.get(key),
  set: (key, value) => rootServer.dataStore.appData.set({ key, value }),
};

const backend: Backend = SUPABASE_URL && SUPABASE_KEY ? new SupabaseBackend(SUPABASE_URL, SUPABASE_KEY) : new MemoryBackend();
const seed = WORDY_SEED || "dev";

// Names for the boards: the member's nickname here and the community's name,
// cached for a few minutes so a game doesn't look them up on every guess.
const cache = new Map<string, { at: number; name: string }>();
let server: { at: number; id: string; name: string } | null = null;
const FRESH = 5 * 60_000;

const names: Names = {
  async who(userId: string): Promise<Who> {
    const now = Date.now();
    if (!server || now - server.at > FRESH) {
      try {
        const c = await rootServer.community.communities.get();
        server = { at: now, id: c.communityId, name: cleanName(c.name, "a server") };
      } catch (e) {
        console.error("[wordy] community lookup:", e);
        if (!server) throw e;
      }
    }
    let n = cache.get(userId);
    if (!n || now - n.at > FRESH) {
      try {
        const m = await rootServer.community.communityMembers.get({ userId: userId as any });
        n = { at: now, name: cleanName(m.nickname, "someone") };
        cache.set(userId, n);
      } catch {
        n = n ?? { at: now, name: "someone" };
      }
    }
    return { userId, name: n.name, serverId: server!.id, serverName: server!.name };
  },
};

const service = new WordyService();
service.table = handlers(new Wordy({ backend, kv, seed, now: () => Date.now() }), names);

async function onStarting(_state: RootAppStartState) {
  rootServer.lifecycle.addService(service);
  console.log(`[wordy] ready (${backend instanceof SupabaseBackend ? "global boards" : "memory boards, dev only"}${WORDY_SEED ? "" : ", dev seed"})`);
}

process.on("unhandledRejection", (e) => {
  console.error("[wordy] unhandled rejection (kept running):", e);
});

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();

// Talks to the wordy server. Inside Root it uses the generated client; with
// ?mock in the URL (dev only) a small fake runs in the browser instead.

export type Backend = { me: string; act(action: string, payload?: unknown): Promise<any> };
let backend: Backend;

export async function connect(): Promise<Backend> {
  if (import.meta.env.DEV && location.search.includes("mock")) {
    const { mockBackend } = await import("./mock");
    backend = mockBackend();
  } else {
    const { rootClient } = await import("@rootsdk/client-app");
    const { wordyServiceClient } = await import("@wordy/gen-client");
    backend = {
      me: rootClient.users.getCurrentUserId(),
      async act(action, payload) {
        const res = await wordyServiceClient.act({ action, payload: JSON.stringify(payload ?? {}) });
        if (!res.ok) throw new Error(res.error || "something went wrong");
        return res.payload ? JSON.parse(res.payload) : null;
      },
    };
  }
  return backend;
}

export const me = () => backend.me;
export const act = <T = any>(action: string, payload?: unknown): Promise<T> => backend.act(action, payload);

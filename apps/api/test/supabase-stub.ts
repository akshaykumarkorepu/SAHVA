import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A minimal stand-in for the two Supabase surfaces the auth middleware touches:
 * GoTrue's /auth/v1/user, and PostgREST's clinic_members table.
 *
 * Using this rather than mocking supabase-js means the tests exercise the real
 * client, the real middleware and the real routes — only the server on the far
 * end is fake.
 */
export type StubState = {
  /** token -> user, or absent to make the token invalid. */
  users: Map<string, { id: string; email: string }>;
  /** staff_id -> membership row, or absent for "not a member of any clinic". */
  members: Map<string, { clinic_id: string; role: string }>;
  requests: { method: string; url: string }[];
};

export async function startSupabaseStub(): Promise<{
  url: string;
  state: StubState;
  close: () => Promise<void>;
}> {
  const state: StubState = { users: new Map(), members: new Map(), requests: [] };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    state.requests.push({ method: req.method ?? "GET", url: req.url ?? "" });

    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/auth/v1/user") {
      const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const user = state.users.get(token);
      if (!user) return send(401, { message: "invalid token" });
      return send(200, { ...user, aud: "authenticated", role: "authenticated" });
    }

    if (url.pathname === "/rest/v1/clinic_members") {
      // staff_id=eq.<uuid>
      const staffId = (url.searchParams.get("staff_id") ?? "").replace(/^eq\./, "");
      const row = state.members.get(staffId);
      // maybeSingle() asks for a single object; a plain select wants an array.
      const wantsObject = (req.headers.accept ?? "").includes("pgrst.object");
      if (wantsObject) return send(200, row ?? null);
      return send(200, row ? [row] : []);
    }

    send(404, { message: `no stub for ${url.pathname}` });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    state,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

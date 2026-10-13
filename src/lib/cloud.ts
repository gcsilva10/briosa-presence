// Shared account on Supabase Auth. Both devices log into the SAME account.
// Only publish the anon key, NEVER the service_role key.
const url = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const storageKey = "briosa-supabase-session";
type Session = { access_token: string; refresh_token: string; expires_at: number };
let refreshInFlight: Promise<Session> | null = null;
const getSession = (): Session | null => {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? "null") as Session | null; }
  catch { return null; }
};
const setSession = (session: Session | null) => {
  if (session) localStorage.setItem(storageKey, JSON.stringify(session));
  else localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event("briosa-auth-change"));
};
export function isCloudConfigured() { return Boolean(url && key); }
export function isSignedIn() { return Boolean(getSession()); }
export function signOut() { setSession(null); }
function decodeError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const value = body as Record<string, unknown>;
    return String(value.msg ?? value.message ?? value.error_description ?? fallback);
  }
  return fallback;
}
async function request(path: string, init: RequestInit = {}, token?: string) {
  if (!isCloudConfigured()) throw new Error("Supabase ainda não está configurado.");
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${key}` }),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(decodeError(body, `Pedido falhou: ${response.status}`));
  }
  return response;
}
export async function signIn(email: string, password: string) {
  const response = await request("/auth/v1/token?grant_type=password", {
    method: "POST", body: JSON.stringify({ email, password }),
  });
  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
  setSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
}
async function token(): Promise<string> {
  const session = getSession();
  if (!session) throw new Error("Inicia sessão para sincronizar as presenças.");
  if (Date.now() < session.expires_at - 60_000) return session.access_token;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await request("/auth/v1/token?grant_type=refresh_token", {
          method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
        const next = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 };
        setSession(next);
        return next;
      } catch (error) {
        setSession(null);
        throw error;
      } finally { refreshInFlight = null; }
    })();
  }
  return (await refreshInFlight).access_token;
}
export async function attendedIds(): Promise<Set<string>> {
  const response = await request("/rest/v1/attendances?select=match_id", {}, await token());
  const rows = await response.json() as Array<{ match_id: string }>;
  return new Set(rows.map(({ match_id }) => match_id));
}
export async function updateAttendance(matchId: string, attended: boolean) {
  const accessToken = await token();
  if (attended) {
    const userResponse = await request("/auth/v1/user", {}, accessToken);
    const user = await userResponse.json() as { id: string };
    await request("/rest/v1/attendances?on_conflict=user_id,match_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: user.id, match_id: matchId }),
    }, accessToken);
  } else {
    await request(`/rest/v1/attendances?match_id=eq.${encodeURIComponent(matchId)}`, {
      method: "DELETE",
    }, accessToken);
  }
}

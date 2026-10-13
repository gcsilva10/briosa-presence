import { useState } from "react";
import { isCloudConfigured, isSignedIn, signIn, signOut } from "../lib/cloud";

export function CloudLogin() {
  const [logged, setLogged] = useState(isSignedIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = isCloudConfigured();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await signIn(email, password);
      setPassword(""); setLogged(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha no login."); }
    finally { setBusy(false); }
  }
  if (!configured) return <aside className="cloud-login"><p>Sincronização por configurar pelo administrador.</p></aside>;
  return <aside className="cloud-login" aria-label="Sincronização das presenças">
    {logged ? <div><span>Presenças sincronizadas com a tua conta.</span>{" "}
      <button type="button" onClick={() => { signOut(); setLogged(false); }}>Terminar sessão</button></div>
      : <form onSubmit={submit}>
        <span>Inicia sessão para teres os mesmos jogos no PC e no telemóvel.</span>{" "}
        <input type="email" autoComplete="email" placeholder="Email" aria-label="Email" required value={email} onChange={event => setEmail(event.target.value)} />{" "}
        <input type="password" autoComplete="current-password" placeholder="Palavra-passe" aria-label="Palavra-passe" required value={password} onChange={event => setPassword(event.target.value)} />{" "}
        <button type="submit" disabled={busy}>{busy ? "A entrar…" : "Entrar"}</button>
      </form>}
    {error && <p className="error-state" role="alert">{error}</p>}
  </aside>;
}

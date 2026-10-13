import { useState } from "react";
import { isCloudConfigured, isSignedIn, signIn, signOut, importRecoveredAttendances } from "../lib/cloud";

export function CloudLogin() {
  const [logged, setLogged] = useState(isSignedIn);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = isCloudConfigured();
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const [recovering, setRecovering] = useState(false);
  async function recover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setRecovering(true); setRecoveryStatus("");
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!data || typeof data !== "object" || !("format" in data) || data.format !== "briosa-attendances-v1" || !("matchIds" in data) || !Array.isArray(data.matchIds) || !data.matchIds.every(id => typeof id === "string")) {
        throw new Error("Ficheiro de recuperação inválido.");
      }
      const count = await importRecoveredAttendances(data.matchIds);
      setRecoveryStatus(`${count} presenças importadas/verificadas. As já existentes foram mantidas.`);
    } catch (error) { setRecoveryStatus(error instanceof Error ? error.message : "Falha na importação."); }
    finally { setRecovering(false); event.target.value = ""; }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await signIn(email.trim(), password);
      setPassword(""); setLogged(true); setExpanded(false);
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível iniciar sessão.");
    } finally { setBusy(false); }
  }

  return <section className="account-bar" aria-label="Conta Briosa">
    <div className="account-bar-inner">
      <div className="account-copy">
        <span className="account-icon" aria-hidden="true">★</span>
        <div><strong>A tua bancada</strong>
          <span>{logged ? "Presenças guardadas na tua conta" : "Guarda as tuas presenças no PC e no telemóvel"}</span></div>
      </div>
      {logged
        ? <button className="account-button account-logout" type="button" onClick={() => { signOut(); setLogged(false); window.location.reload(); }}>Terminar sessão <span aria-hidden="true">↗</span></button>
        : <button className="account-button" type="button" aria-expanded={expanded} aria-controls="account-login-panel" onClick={() => setExpanded(value => !value)}>
            {expanded ? "Fechar" : "Iniciar sessão"} <span aria-hidden="true">{expanded ? "×" : "→"}</span>
          </button>}
    </div>
    {!logged && expanded && <div id="account-login-panel" className="account-panel">
      <div className="account-panel-heading"><span className="eyebrow">Acesso pessoal</span>
        <h2>Volta à bancada.</h2>
        <p>Entra com a mesma conta em todos os dispositivos para manteres a tua lista de jogos.</p>
      </div>
      {!configured ? <p className="error-state" role="alert">A ligação ao Supabase ainda não está configurada.</p>
        : <form className="account-form" onSubmit={submit}>
          <label htmlFor="briosa-email">Email</label>
          <input id="briosa-email" type="email" autoComplete="email" required placeholder="email@exemplo.pt" value={email} onChange={e => setEmail(e.target.value)} />
          <label htmlFor="briosa-password">Palavra-passe</label>
          <div className="account-password">
            <input id="briosa-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}>{showPassword ? "Ocultar" : "Mostrar"}</button>
          </div>
          {error && <p className="error-state" role="alert">{error}</p>}
          <button className="account-submit" type="submit" disabled={busy}>{busy ? "A entrar…" : "Entrar na minha conta →"}</button>
        </form>}
    </div>}
    {logged && <div className="account-recovery"><button className="account-recovery-toggle" type="button" aria-expanded={recoveryOpen} onClick={() => setRecoveryOpen(open => !open)}>Recuperar presenças antigas {recoveryOpen ? "−" : "+"}</button>{recoveryOpen && <div className="account-recovery-form"><p>Importa um ficheiro JSON criado com <code>npm run recover:attendances</code>. As presenças existentes não são apagadas.</p><label htmlFor="recovery-file">Selecionar ficheiro de recuperação</label><input id="recovery-file" type="file" accept=".json,application/json" disabled={recovering} onChange={recover} />{recoveryStatus && <p role="status">{recoveryStatus}</p>}</div>}</div>}
  </section>;
}

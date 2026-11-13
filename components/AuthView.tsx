import { useState, type FormEvent } from "react";
import { Bell, ChefHat, Eye, EyeOff, ShoppingCart } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { resetPasswordWithCode } from "../services/account";

type Mode = "login" | "signup";

function toFakeEmail(username: string) {
  const u = username.trim().toLowerCase();
  const safe = u.replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
  return `${safe}@example.com`;

}

export default function AuthView() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const canSubmit = username.trim().length >= 3 && password.length >= 6;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const email = toFakeEmail(username);

      // username minimo: almeno 3 char validi dopo sanitizzazione
      const localPart = email.split("@")[0] ?? "";
      if (localPart.length < 3) {
        throw new Error("Username non valido (min 3 caratteri, solo lettere/numeri/._-).");
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // Se l'utente esiste già, Supabase spesso ritorna user ma senza identity nuova
        if (data?.user && Array.isArray((data.user as any).identities) && (data.user as any).identities.length === 0) {
          setMsg("Questo username sembra già registrato. Prova ad accedere.");
          setMode("login");
          return;
        }

        setMsg("Registrazione completata. Ora puoi accedere.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setMsg(err?.message ?? "Errore.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1.5 h-12 w-full rounded-2xl bg-ground px-4 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500";

  const canReset =
    username.trim().length >= 3 && resetCode.replace(/[^a-z0-9]/gi, "").length === 16 && resetPassword.length >= 6;

  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetMsg(null);
    setResetLoading(true);
    const err = await resetPasswordWithCode(username, resetCode, resetPassword);
    setResetLoading(false);
    if (err) {
      setResetMsg({ ok: false, text: err });
      return;
    }
    // accesso diretto con la nuova password
    const { error } = await supabase.auth.signInWithPassword({ email: toFakeEmail(username), password: resetPassword });
    if (error) {
      setPassword(resetPassword);
      setResetOpen(false);
      setMsg("Password cambiata. Ora puoi accedere.");
    }
  }

  const switchMode = (next: Mode) => {
    setMsg(null);
    setMode(next);
  };

  const benefits = [
    { icon: <Bell size={20} />, title: "Avvisi prima che scada", text: "Ti ricordo cosa usare, anche ad app chiusa." },
    { icon: <ChefHat size={20} />, title: "Ricette con quello che hai", text: "EcoChef parte dai prodotti in scadenza." },
    { icon: <ShoppingCart size={20} />, title: "Spesa senza doppioni", text: "Scansioni e ti dico se ce l'hai già." },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-ground px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]">
      {/* marchio */}
      <div className="flex items-center gap-2.5">
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
        <span className="font-display text-xl font-extrabold tracking-tight text-ink">EcoDispensa</span>
      </div>

      {/* hero con anteprima di cosa fa l'app */}
      <section className="relative overflow-hidden rounded-4xl bg-forest px-5 pb-5 pt-6 text-white">
        <h1 className="font-display text-[34px] font-extrabold leading-[1.02] tracking-tight">
          Meno sprechi,
          <br />
          più idee in cucina.
        </h1>
        <p className="mt-2 max-w-[17rem] text-sm text-[#BFE3CB]">
          Sai sempre cosa hai in casa, cosa scade e cosa cucinarci.
        </p>

        <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
          <div className="flex items-center gap-2.5 self-start rounded-2xl bg-white px-3 py-2 text-ink shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DCEBFA] font-display font-extrabold text-[#1D4E89]">L</span>
            <span className="text-sm font-bold">Latte</span>
            <span className="rounded-full bg-peach px-2 py-0.5 text-[11px] font-bold text-[#9A3412]">Scade domani</span>
          </div>
          <div className="ml-6 flex items-center gap-2 self-start rounded-2xl bg-lemon px-3 py-2 text-ink shadow-sm">
            <ChefHat size={18} />
            <span className="text-sm font-bold">Frittata · usa 3 tuoi prodotti</span>
          </div>
        </div>
      </section>

      {/* accesso */}
      <section className="rounded-4xl bg-white p-5 shadow-[0_8px_24px_rgba(23,32,26,0.06)]">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-ground p-1" role="tablist" aria-label="Accesso">
          {(
            [
              ["login", "Accedi"],
              ["signup", "Registrati"],
            ] as Array<[Mode, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => switchMode(id)}
              className={`h-10 rounded-xl text-sm transition-all ${
                mode === id ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="auth-username" className="text-xs font-bold text-muted">Username</label>
            <input
              id="auth-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="es. tammaro"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="text-xs font-bold text-muted">Password</label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-12`}
                placeholder="almeno 6 caratteri"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                className="absolute right-1 top-[calc(50%+3px)] flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {msg && <div className="rounded-2xl bg-peach p-3 text-sm font-semibold text-[#8A3B0C]">{msg}</div>}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="mt-1 h-[52px] w-full rounded-2xl bg-emerald-600 text-[15px] font-bold text-white disabled:opacity-50"
          >
            {loading ? "Attendi…" : mode === "login" ? "Entra" : "Crea il mio account"}
          </button>
          {mode === "signup" && (
            <p className="text-center text-xs text-muted">
              Gratis durante il periodo di prova: 5 crediti EcoChef in regalo (20 ricette). Ti servono solo un username e una password.
            </p>
          )}
          {mode === "login" && !resetOpen && (
            <button
              type="button"
              onClick={() => {
                setMsg(null);
                setResetMsg(null);
                setResetOpen(true);
              }}
              className="text-center text-sm font-semibold text-emerald-700"
            >
              Password dimenticata?
            </button>
          )}
        </form>

        {mode === "login" && resetOpen && (
          <form onSubmit={onReset} className="mt-4 flex flex-col gap-3 border-t border-black/5 pt-4">
            <p className="text-sm font-bold text-ink">Nuova password</p>
            <p className="text-sm text-muted">
              Scrivi il tuo username qui sopra, poi il <b className="text-ink">codice di recupero</b> che hai salvato dal Profilo.
            </p>
            <div>
              <label htmlFor="reset-code" className="text-xs font-bold text-muted">Codice di recupero</label>
              <input
                id="reset-code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                className={`${inputClass} font-mono tracking-wider`}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="one-time-code"
              />
            </div>
            <div>
              <label htmlFor="reset-password" className="text-xs font-bold text-muted">Nuova password</label>
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className={inputClass}
                placeholder="almeno 6 caratteri"
                autoComplete="new-password"
              />
            </div>
            {resetMsg && (
              <div className={`rounded-2xl p-3 text-sm font-semibold ${resetMsg.ok ? "bg-mint text-emerald-800" : "bg-peach text-[#8A3B0C]"}`}>
                {resetMsg.text}
              </div>
            )}
            <button
              type="submit"
              disabled={!canReset || resetLoading}
              className="h-12 w-full rounded-2xl bg-ink text-[15px] font-bold text-white disabled:opacity-50"
            >
              {resetLoading ? "Attendi…" : "Cambia password ed entra"}
            </button>
            <p className="text-xs text-muted">
              Non hai il codice? Purtroppo senza codice non è possibile recuperare l'account, perché l'app non chiede l'email.
            </p>
            <button type="button" onClick={() => setResetOpen(false)} className="text-sm font-semibold text-muted">
              Annulla
            </button>
          </form>
        )}
      </section>

      {/* perché usarla */}
      <section className="flex flex-col gap-2.5">
        {benefits.map((b) => (
          <div key={b.title} className="flex items-center gap-3 rounded-3xl bg-white/70 p-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lemon text-ink">{b.icon}</span>
            <span className="text-sm text-muted">
              <span className="block font-bold text-ink">{b.title}</span>
              {b.text}
            </span>
          </div>
        ))}
        <p className="px-1 pt-1 text-center text-xs text-muted">
          In Italia ogni persona butta in media 554 g di cibo a settimana (Waste Watcher 2026).
        </p>
      </section>
    </div>
  );
}

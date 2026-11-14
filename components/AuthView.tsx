import { useState, type FormEvent } from "react";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { resetPasswordWithCode } from "../services/account";

type Mode = "login" | "signup";

function toFakeEmail(username: string) {
  const u = username.trim().toLowerCase();
  const safe = u.replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
  return `${safe}@example.com`;

}

export default function AuthView() {
  const [step, setStep] = useState<"welcome" | "form">("welcome");
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

  const openForm = (next: Mode) => {
    setMsg(null);
    setResetOpen(false);
    setMode(next);
    setStep("form");
  };

  const benefits = ["Avvisi prima che scada", "Ricette con ciò che hai", "Spesa senza doppioni"];

  const shell =
    "mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]";

  // ---------- Benvenuto: foto a tutto schermo, testo e due pulsanti in basso ----------
  if (step === "welcome") {
    return (
      <div className="relative mx-auto min-h-screen max-w-md overflow-hidden bg-[#F7EBD3]">
        <img
          src="/brand/benvenuto-sfondo.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        {/* sfumatura crema in basso: il testo resta leggibile su qualsiasi telefono */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#F7EBD3] via-[#F7EBD3]/90 to-transparent"
        />

        <div className="relative flex min-h-screen flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]">
          <div className="flex items-center gap-2.5 self-start rounded-2xl bg-[#F7EBD3]/85 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm">
            <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-display text-lg font-extrabold tracking-tight text-ink">EcoDispensa</span>
          </div>

          <div className="mt-auto flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[32px] font-extrabold leading-[1.04] tracking-tight text-ink">
                Il cibo che compri, finalmente tutto usato.
              </h1>
              <p className="text-[15px] leading-relaxed text-[#3D4840]">
                Ti avviso prima che scada, ti propongo cosa cucinarci e al supermercato ti dico se ce l'hai già.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {benefits.map((b) => (
                <span key={b} className="rounded-full bg-white/85 px-3 py-1.5 text-[13px] font-bold text-ink">
                  {b}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => openForm("signup")}
                className="h-[54px] w-full rounded-2xl bg-[#4F6B4A] text-[16px] font-bold text-white shadow-[0_8px_20px_rgba(79,107,74,0.3)] active:scale-[0.99]"
              >
                Inizia gratis
              </button>
              <button
                type="button"
                onClick={() => openForm("login")}
                className="h-[54px] w-full rounded-2xl bg-white text-[16px] font-bold text-ink ring-1 ring-black/10 active:scale-[0.99]"
              >
                Ho già un account
              </button>
              <p className="text-center text-xs text-[#3D4840]">Gratis nel periodo di prova · 5 crediti EcoChef in regalo</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Accesso / registrazione ----------
  return (
    <div className={`${shell} bg-ground`}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep("welcome")}
          className="flex h-11 items-center gap-1 rounded-2xl pr-3 text-sm font-bold text-ink"
        >
          <ChevronLeft size={20} /> Indietro
        </button>
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink">
          {mode === "login" ? "Bentornato" : "Crea il tuo account"}
        </h1>
        <p className="text-sm text-muted">
          {mode === "login"
            ? "Entra con il tuo username e la tua password."
            : "Ti servono solo un username e una password: niente email."}
        </p>
      </div>

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

      <p className="px-1 pt-1 text-center text-xs text-muted">
        In Italia ogni persona butta in media 554 g di cibo a settimana (Waste Watcher 2026).
      </p>
    </div>
  );
}

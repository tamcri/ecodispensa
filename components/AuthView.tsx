import { useState, type FormEvent } from "react";
import { supabase } from "../services/supabaseClient";

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
    "mt-1.5 h-12 w-full rounded-2xl bg-white px-4 text-[15px] text-ink outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between bg-ground px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))]">
      <div className="flex flex-col gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" />
        <h1 className="font-display text-[40px] font-extrabold leading-[1.02] tracking-tight text-ink">
          Meno sprechi,
          <br />
          più idee in cucina.
        </h1>
        <p className="text-[15px] text-muted">
          EcoDispensa ricorda cosa hai in casa, ti avvisa prima delle scadenze e ti suggerisce cosa cucinare.
        </p>
      </div>

      <div className="mt-8 rounded-4xl bg-forest p-5 text-white">
        <h2 className="mb-4 font-display text-2xl font-bold">{mode === "login" ? "Bentornato" : "Crea il tuo account"}</h2>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="auth-username" className="text-xs font-bold text-[#BFE3CB]">Username</label>
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
            <label htmlFor="auth-password" className="text-xs font-bold text-[#BFE3CB]">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="min 6 caratteri"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {msg && <div className="rounded-2xl bg-white/10 p-3 text-sm">{msg}</div>}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="mt-1 h-[52px] w-full rounded-2xl bg-lemon text-[15px] font-bold text-ink disabled:opacity-50"
          >
            {loading ? "Attendi…" : mode === "login" ? "Accedi" : "Registrati"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-[#BFE3CB]">
          {mode === "login" ? (
            <>
              Non hai un account?{" "}
              <button
                type="button"
                className="font-bold text-white underline underline-offset-2"
                onClick={() => {
                  setMsg(null);
                  setMode("signup");
                }}
              >
                Registrati
              </button>
            </>
          ) : (
            <>
              Hai già un account?{" "}
              <button
                type="button"
                className="font-bold text-white underline underline-offset-2"
                onClick={() => {
                  setMsg(null);
                  setMode("login");
                }}
              >
                Accedi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

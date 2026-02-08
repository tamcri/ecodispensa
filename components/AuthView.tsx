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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h1 className="text-xl font-bold mb-1">EcoDispensa</h1>
        <p className="text-sm text-gray-500 mb-4">
          {mode === "login" ? "Accedi" : "Crea un account"} con username e password
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm text-gray-600">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full p-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="es. tammaro"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full p-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="min 6 caratteri"
            />
          </div>

          {msg && (
            <div className="text-sm p-3 rounded-xl bg-gray-50 border border-gray-100">
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full p-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50"
          >
            {loading ? "Attendi..." : mode === "login" ? "Accedi" : "Registrati"}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          {mode === "login" ? (
            <>
              Non hai un account?{" "}
              <button
                type="button"
                className="text-emerald-700 font-semibold"
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
                className="text-emerald-700 font-semibold"
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


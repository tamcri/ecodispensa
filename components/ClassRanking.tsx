import React, { useEffect, useState } from 'react';
import { Loader2, Trophy, Users } from 'lucide-react';
import { Sheet } from './ui';
import { MyClass, RankingRow, fetchMyClass, ordinal, pct } from '../services/schools';

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Classifica delle classi di un istituto: solo dati di classe, mai di una singola famiglia */
export const RankingList = ({ rows, highlightId }: { rows: RankingRow[]; highlightId?: string }) => {
  const ranked = rows.filter((r) => r.qualified);
  const waiting = rows.filter((r) => !r.qualified);
  return (
    <div className="flex flex-col gap-3">
      {ranked.length === 0 ? (
        <p className="rounded-2xl bg-ground px-4 py-3 text-[13px] leading-snug text-muted">
          Nessuna classe in classifica per ora. Una classe entra quando almeno 3 famiglie, e almeno il 30% della classe, usano
          la dispensa.
        </p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Classifica delle classi">
          {ranked.map((r) => {
            const mine = r.id === highlightId;
            const top = r.position === 1;
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-2xl p-3 ${mine ? 'bg-forest text-white' : 'bg-white ring-1 ring-black/5'}`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-lg font-extrabold ${
                    top ? 'bg-honey text-[#6E5208]' : mine ? 'bg-white/15 text-white' : 'bg-ground text-ink'
                  }`}
                >
                  {top ? <Trophy size={20} /> : ordinal(r.position ?? 0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    Classe {r.name}
                    {mine ? ' · la tua' : ''}
                  </span>
                  <span className={`block text-xs ${mine ? 'text-[#CFDCC6]' : 'text-muted'}`}>
                    {r.active} famiglie attive su {r.students} · partecipazione {pct(r.participation)}
                  </span>
                </span>
                <span className="text-right">
                  <span className={`block font-display text-xl font-extrabold ${mine ? 'text-honey' : 'text-ink'}`}>
                    {pct(r.waste_rate)}
                  </span>
                  <span className={`block text-[11px] ${mine ? 'text-[#CFDCC6]' : 'text-muted'}`}>buttato</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {waiting.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">In attesa di più famiglie</p>
          {waiting.map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-[13px] ${
                r.id === highlightId ? 'bg-mint text-forest' : 'bg-ground text-ink'
              }`}
            >
              <span className="font-semibold">
                Classe {r.name}
                {r.id === highlightId ? ' · la tua' : ''}
              </span>
              <span className="text-muted">
                {r.active} attive su {r.students}, ne servono {Math.max(3, Math.ceil(r.students * 0.3))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Riga in Home per le famiglie di una classe */
export const MyClassRow = ({ info, onOpen }: { info: MyClass; onOpen: () => void }) => {
  const mine = info.ranking.find((r) => r.id === info.class_id);
  const ranked = info.ranking.filter((r) => r.qualified).length;
  const line = mine?.qualified && mine.position
    ? `${ordinal(mine.position)} su ${ranked} questo mese · ${pct(mine.waste_rate)} buttato`
    : 'Classifica: servono più famiglie attive';
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-3 rounded-3xl bg-white p-4 text-left">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-honey text-[#6E5208]">
        <Trophy size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-ink">
          Classe {info.class_name} · {info.school}
        </span>
        <span className="block truncate text-[13px] text-muted">{line}</span>
      </span>
    </button>
  );
};

/** La classifica dell'istituto, per la famiglia */
export const ClassRankingSheet = ({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: MyClass | null }) => {
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [info, setInfo] = useState<MyClass | null>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPeriod('month');
    setInfo(initial);
  }, [open]);

  const switchTo = async (p: 'month' | 'year') => {
    setPeriod(p);
    setLoading(true);
    setInfo(await fetchMyClass(p));
    setLoading(false);
  };

  const monthName = MONTHS[new Date().getMonth()];

  return (
    <Sheet open={open} onClose={onClose} title="La classifica delle classi">
      {!info ? (
        <Loader2 size={22} className="mx-auto my-8 animate-spin text-muted" />
      ) : (
        <div className="flex flex-col gap-4 pb-4">
          <div className="rounded-3xl bg-forest p-4 text-white">
            <p className="font-display text-lg font-extrabold">
              Classe {info.class_name} · {info.school}
              {info.city ? ` – ${info.city}` : ''}
            </p>
            <p className="mt-1 text-[13px] text-[#CFDCC6]">
              Offerto da <b className="text-honey">{info.partner}</b>. Vince la classe che butta meno: conta la percentuale di prodotti
              buttati su quelli tolti dalla dispensa.
            </p>
          </div>

          <div role="tablist" aria-label="Periodo" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone p-1">
            {(
              [
                ['month', `Mese di ${monthName}`],
                ['year', 'Anno scolastico'],
              ] as Array<['month' | 'year', string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={period === id}
                onClick={() => switchTo(id)}
                className={`h-10 rounded-xl text-[13px] ${period === id ? 'bg-white font-bold text-ink shadow-sm' : 'font-semibold text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <Loader2 size={22} className="mx-auto my-6 animate-spin text-muted" />
          ) : (
            <RankingList rows={info.ranking} highlightId={info.class_id} />
          )}

          <p className="flex gap-2 px-1 text-xs leading-snug text-muted">
            <Users size={16} className="mt-0.5 shrink-0" />
            Qui si vedono solo i dati di ogni classe, mai quelli di una famiglia. I tuoi numeri li trovi in Home e in Le mie
            spese.
          </p>
        </div>
      )}
    </Sheet>
  );
};

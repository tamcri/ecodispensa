import React, { useState, type FormEvent } from 'react';
import { PantryItem, Recipe, IngredientUsage } from '../types';
import { generateRecipesFromPantry, generateRecipeFromIdea } from '../services/geminiService';
import {
  ChefHat,
  Clock,
  BarChart,
  Loader2,
  Sparkles,
  AlertTriangle,
  Search,
  X,
  ChevronRight,
  CheckCircle2,
  Utensils,
} from 'lucide-react';

interface ChefViewProps {
  items: PantryItem[];
  onCook?: (ingredients: IngredientUsage[]) => void;
}

type ChefMode = 'suggest' | 'search';

export const ChefView: React.FC<ChefViewProps> = ({ items, onCook }) => {
  const [mode, setMode] = useState<ChefMode>('suggest');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  // State for selected recipe modal
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isCooked, setIsCooked] = useState(false);

  const inCooldown = cooldownUntil !== null && Date.now() < cooldownUntil;

  const handleGenerateSuggestions = async () => {
    if (items.length === 0) return;

    // blocca doppi click
    if (loading) return;

    // cooldown dopo 429
    if (inCooldown) {
      const sec = Math.ceil(((cooldownUntil as number) - Date.now()) / 1000);
      setError(`Troppi tentativi. Riprova tra ${sec} secondi.`);
      return;
    }

    setLoading(true);
    setError(null);
    setRecipes([]);

    try {
      const result = await generateRecipesFromPantry(items);

      // Se l'API ti ha bloccato, spesso qui arriva []
      if (!result || result.length === 0) {
        setError('Nessuna ricetta generata. Se hai appena provato più volte, aspetta 30 secondi e riprova.');
        return;
      }

      setRecipes(result);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
        setCooldownUntil(Date.now() + 30_000);
        setError('Hai fatto troppe richieste (limite API). Aspetta 30 secondi e riprova.');
      } else {
        setError('Impossibile connettersi allo Chef AI. Riprova più tardi.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ MANCAVA: submit della ricerca
  const handleSearchRecipe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (loading) return;

    if (inCooldown) {
      const sec = Math.ceil(((cooldownUntil as number) - Date.now()) / 1000);
      setError(`Troppi tentativi. Riprova tra ${sec} secondi.`);
      return;
    }

    setLoading(true);
    setError(null);
    setRecipes([]);

    try {
      const result = await generateRecipeFromIdea(searchQuery, items);

      if (!result || result.length === 0) {
        setError('Nessuna ricetta trovata. Riprova con una richiesta diversa.');
        return;
      }

      setRecipes(result);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
        setCooldownUntil(Date.now() + 30_000);
        setError('Hai fatto troppe richieste (limite API). Aspetta 30 secondi e riprova.');
      } else {
        setError('Impossibile cercare la ricetta. Riprova.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCook = () => {
    if (selectedRecipe && onCook) {
      onCook(selectedRecipe.ingredientsUsed);
      setIsCooked(true);
      // Auto close after 2 seconds
      setTimeout(() => {
        setIsCooked(false);
        setSelectedRecipe(null);
      }, 2000);
    }
  };

  const expiringItemsCount = items.filter((i) => {
    if (!i.expiryDate) return false;
    const days = Math.ceil((new Date(i.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return days <= 3;
  }).length;

  return (
    <div className="space-y-6 pb-24">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 rounded-2xl text-white relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="relative z-10">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <ChefHat className="text-emerald-200" /> EcoChef AI
          </h2>
          <p className="text-emerald-50 mb-4 text-sm opacity-90">Il tuo assistente personale per cucinare senza sprechi.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-gray-100 rounded-xl">
        <button
          onClick={() => {
            setMode('suggest');
            setRecipes([]);
            setError(null);
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            mode === 'suggest' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Dispensa Anti-Spreco
        </button>
        <button
          onClick={() => {
            setMode('search');
            setRecipes([]);
            setError(null);
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            mode === 'search' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Cerca & Pianifica
        </button>
      </div>

      {/* CONTENT: Suggest Mode */}
      {mode === 'suggest' && (
        <div className="space-y-4 animate-fade-in">
          {expiringItemsCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-xl text-xs font-medium flex items-center gap-2 text-yellow-700">
              <AlertTriangle size={16} />
              Hai {expiringItemsCount} prodotti in scadenza da usare!
            </div>
          )}

          {recipes.length === 0 && !loading && (
            <div className="text-center py-8">
              <button
                onClick={handleGenerateSuggestions}
                disabled={items.length === 0 || loading || inCooldown}
                className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2 mx-auto"
              >
                <Sparkles size={18} />
                Genera Ricette dalla Dispensa
              </button>
              {items.length === 0 && <p className="text-xs text-gray-400 mt-2">Aggiungi prodotti in dispensa per iniziare.</p>}
            </div>
          )}
        </div>
      )}

      {/* CONTENT: Search Mode */}
      {mode === 'search' && (
        <div className="space-y-4 animate-fade-in">
          <form onSubmit={handleSearchRecipe} className="flex gap-2">
            <input
              type="text"
              placeholder="Cosa vuoi cucinare oggi? (es. Carbonara, Torta di mele)"
              className="flex-1 p-3 rounded-xl border border-gray-200 outline-none focus:border-emerald-500 transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={!searchQuery.trim() || loading || inCooldown}
              className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              title={inCooldown ? 'Aspetta qualche secondo e riprova' : 'Cerca'}
            >
              <Search size={20} />
            </button>
          </form>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-10">
          <Loader2 className="animate-spin mx-auto text-emerald-600 mb-2" size={32} />
          <p className="text-gray-500 text-sm font-medium">
            {mode === 'suggest' ? 'Lo Chef sta analizzando la dispensa...' : 'Sto cercando la ricetta perfetta...'}
          </p>
        </div>
      )}

      {/* Error State */}
      {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm text-center border border-red-100">{error}</div>}

      {/* Recipe List */}
      <div className="space-y-4">
        {recipes.map((recipe, idx) => (
          <div
            key={idx}
            onClick={() => setSelectedRecipe(recipe)}
            className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-emerald-300 transition-all cursor-pointer group active:scale-[0.99]"
          >
            <div className="p-5">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-gray-800 leading-tight group-hover:text-emerald-700 transition-colors">
                  {recipe.title}
                </h3>
                <span
                  className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold tracking-wide border
                    ${
                      recipe.difficulty === 'Facile'
                        ? 'bg-green-50 text-green-700 border-green-100'
                        : recipe.difficulty === 'Media'
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                          : 'bg-red-50 text-red-700 border-red-100'
                    }`}
                >
                  {recipe.difficulty}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                <span className="flex items-center gap-1">
                  <Clock size={14} /> {recipe.time}
                </span>
                <span className="flex items-center gap-1">
                  <BarChart size={14} /> {recipe.ingredientsUsed.length} ingr. usati
                </span>
              </div>

              <p className="text-gray-600 text-sm mb-4 leading-relaxed line-clamp-2">{recipe.description}</p>

              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{
                        width: `${(recipe.ingredientsUsed.length / (recipe.ingredientsUsed.length + recipe.missingIngredients.length)) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 text-right">
                    Hai {recipe.ingredientsUsed.length} su {recipe.ingredientsUsed.length + recipe.missingIngredients.length} ingredienti
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end text-emerald-600 text-sm font-medium mt-2 group-hover:gap-2 transition-all">
                Vedi Ricetta <ChevronRight size={16} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recipe Detail Modal */}
      {selectedRecipe && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex justify-between items-center z-10 rounded-t-2xl">
              <h3 className="font-bold text-lg text-gray-800 truncate pr-4">{selectedRecipe.title}</h3>
              <button onClick={() => setSelectedRecipe(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Meta Info */}
              <div className="flex gap-4 text-sm text-gray-500 border-b border-gray-50 pb-4">
                <span className="flex items-center gap-1 bg-gray-50 px-3 py-1 rounded-lg">
                  <Clock size={16} /> {selectedRecipe.time}
                </span>
                <span className="flex items-center gap-1 bg-gray-50 px-3 py-1 rounded-lg">
                  <BarChart size={16} /> {selectedRecipe.difficulty}
                </span>
              </div>

              {/* Ingredients Section */}
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <CheckCircle2 size={14} /> In Dispensa
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedRecipe.ingredientsUsed.map((ing, i) => (
                      <span key={i} className="text-sm bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-100">
                        <span className="font-bold">
                          {ing.quantity} {ing.unit}
                        </span>{' '}
                        {ing.name}
                      </span>
                    ))}
                    {selectedRecipe.ingredientsUsed.length === 0 && <span className="text-sm text-gray-400 italic">Nessun ingrediente in dispensa.</span>}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShoppingBagIcon /> Da Comprare
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedRecipe.missingIngredients.map((ing, i) => (
                      <span key={i} className="text-sm bg-orange-50 text-orange-800 px-3 py-1.5 rounded-lg border border-orange-100">
                        {ing}
                      </span>
                    ))}
                    {selectedRecipe.missingIngredients.length === 0 && <span className="text-sm text-gray-400 italic">Hai tutto il necessario!</span>}
                  </div>
                </div>
              </div>

              {/* Instructions Section */}
              <div>
                <h4 className="text-lg font-bold text-gray-800 mb-4">Preparazione</h4>
                <div className="space-y-4">
                  {selectedRecipe.steps && selectedRecipe.steps.length > 0 ? (
                    selectedRecipe.steps.map((step, idx) => (
                      <div key={idx} className="flex gap-4">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs mt-0.5">
                          {idx + 1}
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed">{step}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm italic">{selectedRecipe.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Cook Button Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              {isCooked ? (
                <div className="bg-emerald-600 text-white p-3 rounded-xl flex items-center justify-center gap-2 animate-bounce">
                  <CheckCircle2 size={24} />
                  <span className="font-bold">Ottimo! Dispensa aggiornata.</span>
                </div>
              ) : (
                <button
                  onClick={handleConfirmCook}
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                >
                  <Utensils size={20} />
                  Ho cucinato questo piatto! 🍳
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple Icon component for local use
const ShoppingBagIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);


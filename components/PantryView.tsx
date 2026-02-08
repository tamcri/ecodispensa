import React, { useState, useRef, useEffect } from 'react';
import { PantryItem, Category } from '../types';
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '../constants';
import { Trash2, Plus, AlertCircle, Camera, X, Loader2, ChevronDown, Pencil, Check } from 'lucide-react';
import { identifyItemFromImage } from '../services/geminiService';

interface PantryViewProps {
  items: PantryItem[];
  onAdd: (item: Omit<PantryItem, 'id' | 'addedAt'>) => void;
  onUpdate: (id: string, updates: Partial<PantryItem>) => void;
  onRemove: (id: string) => void;
}

export const PantryView: React.FC<PantryViewProps> = ({ items, onAdd, onUpdate, onRemove }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [filterCategory, setFilterCategory] = useState<Category | 'ALL'>('ALL');
  const [newItem, setNewItem] = useState<{ name: string; quantity: number; unit: string; category: Category; expiryDate: string }>({
    name: '',
    quantity: 1,
    unit: 'pz',
    category: Category.FRUIT_VEG,
    expiryDate: ''
  });

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ quantity: number; unit: string }>({ quantity: 1, unit: 'pz' });

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name) return;
    onAdd(newItem);
    setNewItem({ name: '', quantity: 1, unit: 'pz', category: Category.FRUIT_VEG, expiryDate: '' });
    setIsAdding(false);
  };

  const startEditing = (item: PantryItem) => {
      setEditingId(item.id);
      setEditValues({ quantity: item.quantity, unit: item.unit });
  };

  const saveEdit = (id: string) => {
      onUpdate(id, editValues);
      setEditingId(null);
  };

  const cancelEdit = () => {
      setEditingId(null);
  };

  const getDaysUntilExpiry = (dateStr?: string) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  // Camera Logic
  const startCamera = async () => {
    setShowCamera(true);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    } catch (err) {
        console.error("Errore fotocamera:", err);
        alert("Impossibile accedere alla fotocamera. Assicurati di aver concesso i permessi.");
        setShowCamera(false);
    }
  };

  const stopCamera = () => {
      if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
      }
      setShowCamera(false);
  };

  const capturePhoto = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Image = canvas.toDataURL('image/jpeg', 0.8);
          
          // Stop camera immediately after capture
          stopCamera();
          
          // Start analysis
          setIsAnalyzing(true);
          setIsAdding(true); // Open the form
          
          try {
              const result = await identifyItemFromImage(base64Image);
              if (result) {
                  setNewItem(prev => ({
                      ...prev,
                      name: result.name || prev.name,
                      category: result.category as Category || prev.category,
                      quantity: result.quantity || prev.quantity,
                      unit: result.unit || prev.unit,
                      expiryDate: result.expiryDate || prev.expiryDate
                  }));
              } else {
                  alert("Non sono riuscito a riconoscere il prodotto. Riprova o inserisci manualmente.");
              }
          } catch (e) {
              console.error(e);
          } finally {
              setIsAnalyzing(false);
          }
      }
  };

  // Sort: Expiring soon first
  const sortedItems = [...items].sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });

  // Filter based on selected category
  const filteredItems = sortedItems.filter(item => {
    if (filterCategory === 'ALL') return true;
    return item.category === filterCategory;
  });

  return (
    <div className="space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">La Tua Dispensa</h2>
        <div className="flex gap-2">
            <button
            onClick={startCamera}
            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-all flex items-center justify-center"
            title="Scansiona Prodotto"
            >
            <Camera size={20} />
            </button>
            <button
            onClick={() => setIsAdding(!isAdding)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-full flex items-center gap-2 hover:bg-emerald-700 transition-all"
            >
            <Plus size={20} /> Aggiungi
            </button>
        </div>
      </div>

      {/* Category Filter Dropdown */}
      <div className="relative">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as Category | 'ALL')}
          className="w-full appearance-none bg-white border border-gray-200 text-gray-700 py-3 px-4 pr-10 rounded-xl leading-tight focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors cursor-pointer"
        >
          <option value="ALL">🍽️ Tutte le categorie</option>
          {Object.values(Category).map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_EMOJIS[cat]} {cat}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
          <ChevronDown size={20} />
        </div>
      </div>

      {/* Camera Modal Overlay */}
      {showCamera && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
              <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              
              <div className="absolute bottom-10 flex gap-8 items-center">
                  <button 
                      onClick={stopCamera} 
                      className="bg-white/20 text-white p-4 rounded-full backdrop-blur-md hover:bg-white/30"
                  >
                      <X size={24} />
                  </button>
                  <button 
                      onClick={capturePhoto} 
                      className="bg-white border-4 border-gray-300 w-20 h-20 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  >
                      <div className="w-16 h-16 bg-white rounded-full border-2 border-black" />
                  </button>
              </div>
          </div>
      )}

      {/* Analysis Loading Overlay */}
      {isAnalyzing && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white">
              <Loader2 className="animate-spin mb-4" size={48} />
              <p className="font-medium text-lg">Analisi prodotto in corso...</p>
          </div>
      )}

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-xl border border-emerald-100 animate-fade-in">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 font-medium">Cosa hai comprato?</label>
              <input
                type="text"
                placeholder="Es. Latte, Pasta, Mele..."
                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                value={newItem.name}
                onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Quantità</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="w-2/3 p-2 border border-gray-200 rounded-lg"
                  value={newItem.quantity}
                  onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                />
                <select
                  className="w-1/3 p-2 border border-gray-200 rounded-lg bg-gray-50"
                  value={newItem.unit}
                  onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                >
                  <option value="pz">pz</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="l">l</option>
                </select>
              </div>
            </div>
            <div>
               <label className="text-xs text-gray-500 font-medium">Categoria</label>
               <select
                 className="w-full p-2 border border-gray-200 rounded-lg"
                 value={newItem.category}
                 onChange={e => setNewItem({ ...newItem, category: e.target.value as Category })}
               >
                 {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="col-span-2">
               <label className="text-xs text-gray-500 font-medium">Scadenza (Opzionale)</label>
               <input
                 type="date"
                 className="w-full p-2 border border-gray-200 rounded-lg"
                 value={newItem.expiryDate}
                 onChange={e => setNewItem({ ...newItem, expiryDate: e.target.value })}
               />
            </div>
          </div>
          <div className="flex justify-end gap-2">
             <button type="button" onClick={() => setIsAdding(false)} className="text-gray-500 px-3 py-1">Annulla</button>
             <button type="submit" className="bg-emerald-600 text-white px-4 py-1 rounded-lg">Salva</button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
            <p>La dispensa è vuota.</p>
            <p className="text-sm">Aggiungi i tuoi primi prodotti!</p>
        </div>
      ) : filteredItems.length === 0 ? (
         <div className="text-center py-10 text-gray-400">
             <p>Nessun prodotto in questa categoria.</p>
         </div>
      ) : (
        <div className="grid gap-3">
          {filteredItems.map((item) => {
            const daysLeft = getDaysUntilExpiry(item.expiryDate);
            const isExpiring = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;
            const isExpired = daysLeft !== null && daysLeft < 0;
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center hover:border-gray-200 transition-colors">
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl bg-gray-50 flex-shrink-0`}>
                    {CATEGORY_EMOJIS[item.category]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate pr-2">{item.name}</h3>
                    
                    {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                            <input 
                                type="number" 
                                value={editValues.quantity} 
                                onChange={(e) => setEditValues({...editValues, quantity: Number(e.target.value)})}
                                className="w-16 p-1 border border-emerald-300 rounded text-sm outline-none focus:ring-1 focus:ring-emerald-500"
                                min="0"
                            />
                            <select 
                                value={editValues.unit}
                                onChange={(e) => setEditValues({...editValues, unit: e.target.value})}
                                className="p-1 border border-emerald-300 rounded text-sm bg-white outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                                <option value="pz">pz</option>
                                <option value="kg">kg</option>
                                <option value="g">g</option>
                                <option value="l">l</option>
                            </select>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{item.quantity} {item.unit}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${CATEGORY_COLORS[item.category]}`}>
                            {item.category}
                        </span>
                        </div>
                    )}
                    
                    {item.expiryDate && !isEditing && (
                       <p className={`text-xs mt-1 flex items-center gap-1 ${isExpired ? 'text-red-600 font-bold' : isExpiring ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                         {isExpired ? 'SCADUTO' : isExpiring ? 'Scade a breve' : 'Scade il'} {new Date(item.expiryDate).toLocaleDateString('it-IT')}
                         {(isExpired || isExpiring) && <AlertCircle size={12} />}
                       </p>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 ml-2">
                    {isEditing ? (
                         <>
                             <button
                                 onClick={() => saveEdit(item.id)}
                                 className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg transition-colors"
                             >
                                 <Check size={18} />
                             </button>
                             <button
                                 onClick={cancelEdit}
                                 className="text-gray-400 hover:bg-gray-50 p-2 rounded-lg transition-colors"
                             >
                                 <X size={18} />
                             </button>
                         </>
                    ) : (
                        <>
                            <button
                                onClick={() => startEditing(item)}
                                className="text-gray-300 hover:text-emerald-500 p-2 transition-colors"
                            >
                                <Pencil size={18} />
                            </button>
                            <button
                                onClick={() => onRemove(item.id)}
                                className="text-gray-300 hover:text-red-500 p-2 transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
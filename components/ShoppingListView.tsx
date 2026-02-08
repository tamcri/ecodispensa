import React, { useState, useRef } from 'react';
import { ShoppingItem, Category, PantryItem } from '../types';
import { CATEGORY_COLORS } from '../constants';
import { Plus, Check, Trash, ArrowRight, Camera, X, Loader2 } from 'lucide-react';
import { identifyItemFromImage } from '../services/geminiService';

interface ShoppingListViewProps {
  items: ShoppingItem[];
  onAdd: (name: string, category: Category) => void;
  onToggle: (id: string) => void;
  onClearCompleted: () => void;
  onMoveToPantry: (itemsToAdd: Omit<PantryItem, 'id' | 'addedAt'>[], shoppingIdsToRemove: string[]) => void;
}

export const ShoppingListView: React.FC<ShoppingListViewProps> = ({ items, onAdd, onToggle, onClearCompleted, onMoveToPantry }) => {
  const [itemName, setItemName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>(Category.FRUIT_VEG);

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Move Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [itemsToMoveData, setItemsToMoveData] = useState<{
      originalId: string;
      name: string;
      category: Category;
      quantity: number;
      unit: string;
      expiryDate: string;
  }[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (itemName.trim()) {
      onAdd(itemName, selectedCategory);
      setItemName('');
    }
  };

  // --- Camera Logic (Duplicated from PantryView for independence) ---
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
        alert("Impossibile accedere alla fotocamera.");
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
          stopCamera();
          setIsAnalyzing(true);
          try {
              const result = await identifyItemFromImage(base64Image);
              if (result && result.name) {
                  setItemName(result.name);
                  if (result.category) setSelectedCategory(result.category);
              } else {
                  alert("Non sono riuscito a riconoscere il prodotto.");
              }
          } catch (e) {
              console.error(e);
          } finally {
              setIsAnalyzing(false);
          }
      }
  };

  // --- Move to Pantry Logic ---
  const handleInitiateMove = () => {
      const completedItems = items.filter(i => i.isChecked);
      if (completedItems.length === 0) return;

      // Prepare initial data for the modal
      const initialData = completedItems.map(item => ({
          originalId: item.id,
          name: item.name,
          category: item.category,
          quantity: 1,
          unit: 'pz',
          expiryDate: ''
      }));
      setItemsToMoveData(initialData);
      setIsMoveModalOpen(true);
  };

  const updateMoveItemData = (index: number, field: string, value: any) => {
      const newData = [...itemsToMoveData];
      newData[index] = { ...newData[index], [field]: value };
      setItemsToMoveData(newData);
  };

  const confirmMove = () => {
      const itemsToAdd = itemsToMoveData.map(d => ({
          name: d.name,
          category: d.category,
          quantity: d.quantity,
          unit: d.unit,
          expiryDate: d.expiryDate || undefined
      }));
      const idsToRemove = itemsToMoveData.map(d => d.originalId);
      
      onMoveToPantry(itemsToAdd, idsToRemove);
      setIsMoveModalOpen(false);
  };

  const completedItems = items.filter(i => i.isChecked);
  const activeItems = items.filter(i => !i.isChecked);

  return (
    <div className="space-y-6 pb-24">
      <h2 className="text-2xl font-bold text-gray-800">Lista della Spesa</h2>

      <div className="flex flex-col sm:flex-row gap-2">
  <form
    onSubmit={handleSubmit}
    className="flex-1 flex gap-2 items-center bg-white p-2 rounded-xl border border-gray-100 min-w-0"
  >
    <input
      type="text"
      value={itemName}
      onChange={(e) => setItemName(e.target.value)}
      placeholder="Aggiungi prodotto..."
      className="flex-1 p-2 outline-none bg-transparent min-w-0"
    />
    <select
      value={selectedCategory}
      onChange={(e) => setSelectedCategory(e.target.value as Category)}
      className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-2 max-w-[80px] sm:max-w-[100px]"
    >
      {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
    </select>
    <button
      type="submit"
      className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      disabled={!itemName.trim()}
    >
      <Plus size={20} />
    </button>
  </form>

  <button
    onClick={startCamera}
    className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center w-full sm:w-auto flex-shrink-0"
    title="Scansiona per aggiungere alla lista"
  >
    <Camera size={25} />
  </button>
</div>


      <div className="space-y-2">
        {activeItems.map((item) => (
          <div
            key={item.id}
            onClick={() => onToggle(item.id)}
            className="group flex items-center p-3 bg-white rounded-lg border border-gray-100 cursor-pointer hover:border-emerald-200 transition-all"
          >
            <div className="w-5 h-5 rounded border-2 border-gray-300 mr-3 flex items-center justify-center transition-colors group-hover:border-emerald-400">
            </div>
            <span className="flex-1 font-medium text-gray-700">{item.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${CATEGORY_COLORS[item.category]}`}>
                {item.category}
            </span>
          </div>
        ))}
        {activeItems.length === 0 && items.length === 0 && (
             <div className="text-center py-8 text-gray-400 text-sm">Nessun articolo nella lista.</div>
        )}
      </div>

      {completedItems.length > 0 && (
        <div className="mt-8">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Completati ({completedItems.length})</h3>
            <button onClick={onClearCompleted} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                <Trash size={12} /> Pulisci
            </button>
          </div>
          <div className="space-y-2 opacity-60">
            {completedItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onToggle(item.id)}
                className="flex items-center p-3 bg-gray-50 rounded-lg border border-transparent cursor-pointer"
              >
                <div className="w-5 h-5 rounded bg-emerald-500 border-2 border-emerald-500 mr-3 flex items-center justify-center text-white">
                    <Check size={14} strokeWidth={3} />
                </div>
                <span className="flex-1 font-medium text-gray-500 line-through decoration-gray-400">{item.name}</span>
              </div>
            ))}
          </div>
          
          <button 
            onClick={handleInitiateMove}
            className="w-full mt-4 bg-emerald-600 text-white py-3 rounded-xl font-medium hover:bg-emerald-700 flex justify-center items-center gap-2 transition-colors"
          >
            <ArrowRight size={18} />
            Sposta {completedItems.length} in Dispensa
          </button>
        </div>
      )}

      {/* Camera Modal */}
      {showCamera && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute bottom-10 flex gap-8 items-center">
                  <button onClick={stopCamera} className="bg-white/20 text-white p-4 rounded-full backdrop-blur-md hover:bg-white/30"><X size={24} /></button>
                  <button onClick={capturePhoto} className="bg-white border-4 border-gray-300 w-20 h-20 rounded-full flex items-center justify-center active:scale-95 transition-transform"><div className="w-16 h-16 bg-white rounded-full border-2 border-black" /></button>
              </div>
          </div>
      )}

      {/* Analysis Loader */}
      {isAnalyzing && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white">
              <Loader2 className="animate-spin mb-4" size={48} />
              <p className="font-medium text-lg">Analisi prodotto...</p>
          </div>
      )}

      {/* Move to Pantry Detail Modal */}
      {isMoveModalOpen && (
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-2xl p-6 animate-fade-in max-h-[85vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-gray-800">Dettagli Prodotti</h3>
                      <button onClick={() => setIsMoveModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                  </div>
                  <p className="text-sm text-gray-500 mb-6">Inserisci quantità e scadenza prima di spostare in dispensa.</p>
                  
                  <div className="space-y-6">
                      {itemsToMoveData.map((item, idx) => (
                          <div key={item.originalId} className="border-b border-gray-100 pb-4 last:border-0">
                              <h4 className="font-semibold text-emerald-700 mb-2">{item.name}</h4>
                              <div className="grid grid-cols-2 gap-3">
                                  <div>
                                      <label className="text-xs text-gray-500 block mb-1">Quantità</label>
                                      <div className="flex gap-1">
                                          <input 
                                              type="number" 
                                              className="w-2/3 p-2 border border-gray-200 rounded-lg text-sm"
                                              value={item.quantity}
                                              onChange={(e) => updateMoveItemData(idx, 'quantity', Number(e.target.value))}
                                          />
                                          <select 
                                              className="w-1/3 p-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                                              value={item.unit}
                                              onChange={(e) => updateMoveItemData(idx, 'unit', e.target.value)}
                                          >
                                              <option value="pz">pz</option>
                                              <option value="kg">kg</option>
                                              <option value="g">g</option>
                                              <option value="l">l</option>
                                          </select>
                                      </div>
                                  </div>
                                  <div>
                                      <label className="text-xs text-gray-500 block mb-1">Scadenza</label>
                                      <input 
                                          type="date" 
                                          className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                                          value={item.expiryDate}
                                          onChange={(e) => updateMoveItemData(idx, 'expiryDate', e.target.value)}
                                      />
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3">
                      <button 
                          onClick={() => setIsMoveModalOpen(false)} 
                          className="flex-1 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-xl transition-colors"
                      >
                          Annulla
                      </button>
                      <button 
                          onClick={confirmMove} 
                          className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
                      >
                          Conferma Spostamento
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
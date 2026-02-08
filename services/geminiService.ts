
import { GoogleGenAI, Type } from "@google/genai";
import { PantryItem, Recipe, Category } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

// Helper to get today's date for context
const getTodayDate = () => new Date().toISOString().split('T')[0];

const recipeSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      difficulty: { type: Type.STRING, description: "Facile, Media, o Difficile" },
      time: { type: Type.STRING, description: "Tempo stimato, es. '30 min'" },
      description: { type: Type.STRING, description: "Breve descrizione del piatto" },
      ingredientsUsed: { 
        type: Type.ARRAY, 
        items: { 
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING, description: "Nome dell'ingrediente esattamente come presente in dispensa" },
                quantity: { type: Type.NUMBER, description: "Quantità numerica usata" },
                unit: { type: Type.STRING, description: "Unità di misura (g, kg, l, ml, pz)" }
            } 
        },
        description: "Lista degli ingredienti presi dalla dispensa con le quantità necessarie"
      },
      missingIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
      steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista ordinata dei passaggi per la preparazione" }
    }
  }
};

export const generateRecipesFromPantry = async (items: PantryItem[]): Promise<Recipe[]> => {
  if (items.length === 0) return [];

  const inventoryList = items.map(i => `${i.quantity} ${i.unit} di ${i.name} (scade il: ${i.expiryDate || 'N/A'})`).join(', ');

  const prompt = `
    Agisci come uno chef esperto di cucina sostenibile e anti-spreco.
    Ho questi ingredienti nella mia dispensa: ${inventoryList}.
    
    Suggerisci 3 ricette gustose che posso preparare principalmente con questi ingredienti per evitare che scadano.
    
    IMPORTANTE:
    - In "ingredientsUsed", devi indicare ESATTAMENTE il nome del prodotto presente in dispensa e la quantità necessaria per la ricetta.
    - Se serve mezza bottiglia di latte e in dispensa c'è "Latte", scrivi quantity: 0.5, unit: l (o l'unità coerente).
    - È accettabile suggerire di comprare 1-2 ingredienti freschi extra se necessario.
    
    Rispondi SOLO con un JSON array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as Recipe[];

  } catch (error) {
    console.error("Errore Gemini:", error);
    return [];
  }
};

export const generateRecipeFromIdea = async (idea: string, pantryItems: PantryItem[]): Promise<Recipe[]> => {
    const inventoryList = pantryItems.map(i => i.name).join(', ');
  
    const prompt = `
      L'utente vuole cucinare: "${idea}".
      
      La sua dispensa contiene: ${inventoryList}.
      
      1. Genera una ricetta dettagliata per "${idea}".
      2. Confronta gli ingredienti necessari per la ricetta con quelli in dispensa.
      3. Metti in "ingredientsUsed" SOLO quelli presenti in dispensa che servono per la ricetta. Usa quantità numeriche precise.
      4. Metti in "missingIngredients" TUTTO ciò che manca e che l'utente deve comprare.
      
      Restituisci un array contenente questa singola ricetta (o varianti se la richiesta è generica).
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: recipeSchema
        }
      });
  
      const text = response.text;
      if (!text) return [];
      return JSON.parse(text) as Recipe[];
  
    } catch (error) {
      console.error("Errore Gemini (Idea):", error);
      return [];
    }
  };

export const suggestShoppingList = async (pantryItems: PantryItem[], history: string[]): Promise<string[]> => {
    return [];
}

export const identifyItemFromImage = async (base64Image: string): Promise<Partial<PantryItem> | null> => {
  const prompt = `
    Analizza questa immagine di un prodotto alimentare.
    Identifica il prodotto e restituisci un oggetto JSON con:
    - name: Nome breve e descrittivo in Italiano (es. "Latte Parzialmente Scremato", "Mele Golden").
    - category: Una delle seguenti categorie esatte: ${Object.values(Category).join(', ')}.
    - quantity: Stima numerica della quantità (di default 1 se non chiaro).
    - unit: Unità di misura stimata (pz, kg, l, g).
    - expiryDate: Una stima della data di scadenza (YYYY-MM-DD) basata sul tipo di prodotto fresco assumendo che sia stato comprato oggi (${getTodayDate()}). Se è un prodotto a lunga conservazione, lascia vuoto o stima una data lontana.
    
    Se non è un prodotto alimentare, restituisci null.
  `;

  try {
    const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                expiryDate: { type: Type.STRING },
            }
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as Partial<PantryItem>;
  } catch (error) {
    console.error("Errore Visione Gemini:", error);
    return null;
  }
};

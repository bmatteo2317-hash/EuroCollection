// Mappa riga di `user_collection` -> stato usato dalla UI ottimistica.
// Chiave: coin_id stabile da lib/catalog.ts (es. "it-2004-2euro-commemorative-0")
export type CollectionMap = Record<string, number>;

export interface CollectionRow {
  coin_id: string;
  quantity: number;
  updated_at: string;
}

export interface CollectionStats {
  owned: number; // tipi distinti posseduti (qty >= 1)
  total: number; // totale catalogo Eurozona
  percent: number; // 0..100
  pieces: number; // pezzi totali (somma quantità)
}

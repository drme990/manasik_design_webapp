// `SyncStatus`/`SyncableDocument` are historical naming from an earlier
// offline-first design, but are still the shape used by every document
// stored in MongoDB (Project, PdfProject, BookingProduct, ...):
// - `syncStatus: 'synced'` once the document has been written to the DB.
// - `syncedAt` records when that happened.
// There is no offline sync engine anymore — the DB is always the source of
// truth — but the fields are kept as-is to match the existing DB schema.
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export interface SyncableDocument {
  id: string;
  _id?: string;
  syncedAt?: number;
  localModifiedAt: number;
  syncStatus: SyncStatus;
  [key: string]: unknown; // Allow additional properties
}
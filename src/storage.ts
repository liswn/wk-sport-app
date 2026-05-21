import { AppData, DEFAULT_SETTINGS, TrainingTemplate, defaultTrainingTemplates } from "./model";

const DB_NAME = "wk-sport-local";
const STORE_NAME = "app";
const DB_VERSION = 1;
const APP_DATA_KEY = "data";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = action(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadAppData(): Promise<AppData> {
  const data = await withStore<AppData | undefined>("readonly", (store) => store.get(APP_DATA_KEY));
  return normalizeData(data);
}

export async function saveAppData(data: AppData) {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(normalizeData(data), APP_DATA_KEY));
}

export async function exportData() {
  const data = await loadAppData();
  return {
    schema: "wk-sport-app-v1",
    exportedAt: new Date().toISOString(),
    data
  };
}

export async function importData(payload: unknown) {
  const raw = payload as { data?: AppData };
  await saveAppData(normalizeData(raw.data ?? (payload as AppData)));
}

export async function clearAllData() {
  await withStore<undefined>("readwrite", (store) => store.clear() as IDBRequest<undefined>);
}

function normalizeData(data?: Partial<AppData>): AppData {
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) },
    plans: data?.plans ?? {},
    bodyEntries: data?.bodyEntries ?? {},
    checkins: data?.checkins ?? {},
    trainingTemplates: mergeTrainingTemplates(data?.trainingTemplates)
  };
}

function mergeTrainingTemplates(saved?: TrainingTemplate[]) {
  if (!saved || saved.length === 0) return defaultTrainingTemplates;

  const defaultIds = new Set(defaultTrainingTemplates.map((template) => template.id));
  const legacyIds = new Set([
    "recovery",
    "z2",
    "sweetspot",
    "long-z2",
    "strength-a",
    "strength-b",
    "threshold",
    "rest"
  ]);
  const customTemplates: TrainingTemplate[] = [];
  const seenCustomIds = new Set<string>();
  for (const template of saved) {
    if (defaultIds.has(template.id) || legacyIds.has(template.id) || seenCustomIds.has(template.id)) continue;
    seenCustomIds.add(template.id);
    customTemplates.push(template);
  }

  return [...defaultTrainingTemplates, ...customTemplates];
}

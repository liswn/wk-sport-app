import {
  AppData,
  DEFAULT_AI_MODEL,
  DEFAULT_SETTINGS,
  SUPPORTED_CHATGPT_MODELS,
  TrainingTemplate,
  defaultTrainingTemplates,
} from "./model";

const DB_NAME = "wk-sport-local";
const STORE_NAME = "app";
const DB_VERSION = 1;
const APP_DATA_KEY = "data";
const CRYPTO_KEY = "crypto-key";
const SECRET_FIELDS = ["intervalsApiKey", "aiApiKey"] as const;

type SecretField = (typeof SECRET_FIELDS)[number];
type EncryptedSecret = {
  __wkEncryptedSecret: "v1";
  iv: string;
  value: string;
};

type StoredSettings = Omit<AppData["settings"], SecretField> &
  Partial<Record<SecretField, string | EncryptedSecret>>;

type StoredAppData = Omit<AppData, "settings"> & {
  settings: StoredSettings;
};

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
  const data = await withStore<StoredAppData | AppData | undefined>("readonly", (store) => store.get(APP_DATA_KEY));
  return normalizeData(await decryptAppData(data));
}

export async function saveAppData(data: AppData) {
  const encrypted = await encryptAppData(normalizeData(data));
  await withStore<IDBValidKey>("readwrite", (store) =>
    store.put(encrypted, APP_DATA_KEY),
  );
}

export async function exportData() {
  const data = await loadAppData();
  return {
    schema: "wk-sport-app-v1",
    exportedAt: new Date().toISOString(),
    encryption: {
      version: 1,
      fields: SECRET_FIELDS,
      note: "API keys are encrypted with this browser's local key. Importing on another browser will keep other data but requires re-entering API keys.",
    },
    data: await encryptAppData(data)
  };
}

export async function importData(payload: unknown) {
  const raw = payload as { data?: AppData };
  const data = normalizeData(await decryptAppData(raw.data ?? (payload as AppData)));
  await saveAppData(data);
  return data;
}

export async function clearAllData() {
  await withStore<undefined>("readwrite", (store) => store.clear() as IDBRequest<undefined>);
}

function normalizeData(data?: Partial<AppData>): AppData {
  const settings = { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) };
  if (
    settings.aiEndpoint === "https://api.54lb.com/v1/chat/completions" &&
    !settings.aiApiKey?.trim()
  ) {
    settings.aiEndpoint = "";
  }
  if (
    settings.aiModel?.trim() &&
    !SUPPORTED_CHATGPT_MODELS.includes(
      settings.aiModel.trim() as (typeof SUPPORTED_CHATGPT_MODELS)[number],
    )
  ) {
    settings.aiModel = DEFAULT_AI_MODEL;
  }

  return {
    settings,
    plans: data?.plans ?? {},
    bodyEntries: data?.bodyEntries ?? {},
    checkins: data?.checkins ?? {},
    trainingLogs: data?.trainingLogs ?? {},
    activityAnalyses: data?.activityAnalyses ?? {},
    dayMemos: data?.dayMemos ?? {},
    lastFatigueReport: data?.lastFatigueReport,
    aiCoachSession: data?.aiCoachSession
      ? {
          ...data.aiCoachSession,
          messages: (data.aiCoachSession.messages ?? []).slice(-50),
        }
      : undefined,
    trainingTemplates: mergeTrainingTemplates(data?.trainingTemplates)
  };
}

async function encryptAppData(data: AppData): Promise<StoredAppData> {
  const settings: StoredSettings = { ...data.settings };
  for (const field of SECRET_FIELDS) {
    const value = data.settings[field]?.trim();
    settings[field] = value ? await encryptSecret(value) : "";
  }
  return { ...data, settings };
}

async function decryptAppData(
  data?: Partial<StoredAppData | AppData>,
): Promise<Partial<AppData> | undefined> {
  if (!data?.settings) return data as Partial<AppData> | undefined;
  const settings = { ...data.settings } as Record<string, unknown>;
  for (const field of SECRET_FIELDS) {
    const value = settings[field];
    settings[field] = await decryptSecret(value);
  }
  return { ...data, settings } as Partial<AppData>;
}

async function encryptSecret(value: string): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getSecretKey(),
    encoded,
  );
  return {
    __wkEncryptedSecret: "v1",
    iv: bytesToBase64(iv),
    value: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptSecret(value: unknown): Promise<string> {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (!isEncryptedSecret(value)) return "";
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(value.iv) },
      await getSecretKey(),
      base64ToBytes(value.value),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as EncryptedSecret).__wkEncryptedSecret === "v1" &&
      typeof (value as EncryptedSecret).iv === "string" &&
      typeof (value as EncryptedSecret).value === "string",
  );
}

async function getSecretKey() {
  const saved = await withStore<CryptoKey | undefined>("readonly", (store) =>
    store.get(CRYPTO_KEY),
  );
  if (saved) return saved;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await withStore<IDBValidKey>("readwrite", (store) => store.put(key, CRYPTO_KEY));
  return key;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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

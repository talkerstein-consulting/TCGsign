// The app's one IndexedDB database. Each store holds something the person chose to keep on this device.
const DB = "tcg-sign";
const STORES = { signatures: "kind", drafts: "id" } as const;
export type Store = keyof typeof STORES;

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

/** Empties every store: all drafts and kept signatures. */
export async function clearAll() {
  for (const store of Object.keys(STORES) as Store[]) await run(store, "readwrite", (s) => s.clear());
}

export async function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((ok, fail) => {
      const req = fn(d.transaction(store, mode).objectStore(store));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
  } finally { d.close(); }
}

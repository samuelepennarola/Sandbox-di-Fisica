// Archivio delle immagini (istantanee degli esperimenti) nel browser, con IndexedDB:
// localStorage è troppo piccolo per le immagini, IndexedDB tiene centinaia di MB.

const DB = 'fisica', STORE = 'blobs';
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const putBlob = (id, blob) => run('readwrite', s => s.put(blob, id));
export const getBlob = id => run('readonly', s => s.get(id));
export const delBlob = id => run('readwrite', s => s.delete(id));

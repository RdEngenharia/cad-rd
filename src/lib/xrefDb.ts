/**
 * xrefDb.ts
 * -----------------------------------------------------------------------
 * Persistência local (IndexedDB) dos binários de XREF (imagem/PDF).
 *
 * Por que isso existe: o Firestore só guarda METADADOS do XRef (nome,
 * x, y, escala) -- nunca o arquivo em si, para manter o projeto 100%
 * dentro do plano gratuito. O arquivo real (Blob) mora só no navegador.
 *
 * Usamos Object URLs (`URL.createObjectURL`) para exibir o arquivo
 * imediatamente durante a sessão, e gravamos o Blob no IndexedDB para
 * conseguirmos recriar o Object URL depois de um F5 (Object URLs morrem
 * ao recarregar a página, o conteúdo do IndexedDB não).
 * -----------------------------------------------------------------------
 */

const DB_NAME = "cad-unifilar-xrefs";
const STORE_NAME = "arquivos";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste ambiente."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Salva o Blob de um XRef sob a chave `xrefId`. */
export async function saveXrefBlob(xrefId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, xrefId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Recupera o Blob de um XRef, ou `undefined` se nunca foi salvo. */
export async function loadXrefBlob(xrefId: string): Promise<Blob | undefined> {
  const db = await openDb();
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(xrefId);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

/** Remove o Blob de um XRef (usado quando o usuário apaga a referência). */
export async function deleteXrefBlob(xrefId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(xrefId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

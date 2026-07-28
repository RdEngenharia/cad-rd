"use client";

import { useEffect } from "react";
import { useCadStore } from "./store";
import { loadXrefBlob } from "./xrefDb";

/**
 * useHydrateXrefs
 * -----------------------------------------------------------------------
 * Depois de carregar um projeto do Firestore (ou do mock local), os
 * XREFs vêm só com metadados (sem `objectUrl`, já que Blob URLs não
 * sobrevivem a um F5). Este hook tenta reidratar cada XREF buscando o
 * Blob original no IndexedDB deste mesmo navegador e recriando o
 * Object URL -- se o Blob não existir mais (ex.: outro navegador/
 * dispositivo), o XREF continua exibido como placeholder (ver
 * XrefLayer), igual a uma XREF "não encontrada" no AutoCAD.
 * -----------------------------------------------------------------------
 */
export function useHydrateXrefs() {
  const xrefs = useCadStore((s) => s.projeto.xrefs);
  const updateXref = useCadStore((s) => s.updateXref);

  useEffect(() => {
    const semUrl = xrefs.filter((x) => !x.objectUrl);
    if (semUrl.length === 0) return;

    let cancelado = false;
    (async () => {
      for (const xref of semUrl) {
        const blob = await loadXrefBlob(xref.id);
        if (blob && !cancelado) {
          const objectUrl = URL.createObjectURL(blob);
          updateXref(xref.id, { objectUrl });
        }
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a xrefs sem url
  }, [xrefs]);
}

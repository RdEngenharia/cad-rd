"use client";

import { useEffect, useState } from "react";

/**
 * useImage
 * -----------------------------------------------------------------------
 * Hook simples que carrega uma URL (data-URI, Blob/Object URL, http...)
 * como HTMLImageElement, pronto para ser usado como `image` de um
 * `Konva.Image`. Usado tanto para os blocos SVG carimbados quanto para
 * as imagens de XREF (foto/planta de fundo).
 * -----------------------------------------------------------------------
 */
export function useImage(src: string | undefined | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelado = false;

    if (!src) {
      // Descarta a imagem anterior de forma assíncrona: evita disparar um
      // setState síncrono direto no corpo do efeito (regra
      // react-hooks/set-state-in-effect), mantendo o mesmo resultado.
      queueMicrotask(() => {
        if (!cancelado) setImg(null);
      });
      return () => {
        cancelado = true;
      };
    }

    const image = new window.Image();
    image.onload = () => {
      if (!cancelado) setImg(image);
    };
    image.onerror = () => {
      if (!cancelado) setImg(null);
    };
    image.src = src;

    return () => {
      cancelado = true;
    };
  }, [src]);

  return img;
}

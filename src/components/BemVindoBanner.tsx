"use client";

import { useEffect, useState } from "react";
import { useCadStore } from "@/lib/store";

const CHAVE_VISTO = "cad-unifilar:boas-vindas-vista";

/**
 * BemVindoBanner
 * -----------------------------------------------------------------------
 * Iteração 45 -- "onboarding simples" (melhoria sugerida e aceita pelo
 * usuário, com o pedido explícito: "quero avisos fáceis e limpos, foque
 * na experiência do usuário, se ficar muito confuso o usuario desiste").
 * Por isso, de propósito, NÃO é um tour guiado de várias etapas (com
 * setas apontando pra cada botão, popups sequenciais etc.) -- é só uma
 * frase, uma vez só, fácil de dispensar. Um tour complexo tem mais chance
 * de confundir/cansar um usuário vindo de um link do WhatsApp do que
 * ajudar.
 *
 * Aparece 1x (por NAVEGADOR, não por conta -- é uma simplificação
 * aceitável: a flag mora no localStorage, mesmo padrão de
 * `salvarTemaCanvas`/outras preferências só-deste-dispositivo do resto do
 * app) depois do primeiro login, apontando pro botão "❓ Ajuda" e
 * lembrando do comportamento estilo AutoCAD da linha de comando (o
 * detalhe que gerou a reclamação original do usuário, Iteração 45). Some
 * pra sempre assim que dispensado.
 *
 * Lido só depois de montado (useEffect, não direto no render) -- mesmo
 * motivo do resto do app: `localStorage` não existe durante SSR, ler
 * direto no corpo do componente causaria mismatch de hidratação.
 * -----------------------------------------------------------------------
 */
export function BemVindoBanner() {
  const usuario = useCadStore((s) => s.usuario);
  const abrirAjuda = useCadStore((s) => s.abrirAjuda);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    // `setVisivel` roda dentro do callback do rAF (não direto no corpo do
    // efeito) pra não disparar setState síncrono dentro de um efeito --
    // mesmo padrão já usado em `CalibrationModal.tsx`/`ProjectManagerModal.tsx`.
    const id = requestAnimationFrame(() => {
      try {
        if (!window.localStorage.getItem(CHAVE_VISTO)) setVisivel(true);
      } catch {
        // localStorage indisponível -- falha segura, simplesmente não mostra
        // o banner (não é essencial, só uma dica).
      }
    });
    return () => cancelAnimationFrame(id);
  }, [usuario]);

  function dispensar() {
    setVisivel(false);
    try {
      window.localStorage.setItem(CHAVE_VISTO, "1");
    } catch {
      // Sem storage disponível pra lembrar -- o banner pode reaparecer na
      // próxima visita, mas dispensar ainda funciona pra esta sessão.
    }
  }

  if (!visivel) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] text-blue-800">
      <span>
        👋 Dica rápida: dá pra digitar o comando direto na tela, sem clicar em nada antes (igual AutoCAD). Veja o
        manual completo em{" "}
        <button type="button" onClick={abrirAjuda} className="font-medium underline">
          ❓ Ajuda
        </button>
        .
      </span>
      <button
        type="button"
        onClick={dispensar}
        className="shrink-0 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
      >
        Entendi
      </button>
    </div>
  );
}

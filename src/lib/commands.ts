/**
 * commands.ts
 * -----------------------------------------------------------------------
 * Interpretador da linha de comando estilo AutoCAD. Mapeia o texto
 * digitado (abreviação de 1 letra ou nome completo) para a ferramenta
 * correspondente. Puro e sem estado -- fácil de testar isoladamente.
 * -----------------------------------------------------------------------
 */

import type { Ferramenta } from "./types";

interface ResultadoFerramenta {
  tipo: "ferramenta";
  ferramenta: Ferramenta;
  ecoAcao: string;
}
interface ResultadoCancelar {
  tipo: "cancelar";
}
interface ResultadoDesconhecido {
  tipo: "desconhecido";
}

export type ResultadoComando = ResultadoFerramenta | ResultadoCancelar | ResultadoDesconhecido;

const MAPA_COMANDOS: Record<string, { ferramenta: Ferramenta; ecoAcao: string }> = {
  L: { ferramenta: "linha", ecoAcao: "LINHA" },
  LINE: { ferramenta: "linha", ecoAcao: "LINHA" },
  LINHA: { ferramenta: "linha", ecoAcao: "LINHA" },

  C: { ferramenta: "circulo", ecoAcao: "CIRCULO" },
  CIRCLE: { ferramenta: "circulo", ecoAcao: "CIRCULO" },
  CIRCULO: { ferramenta: "circulo", ecoAcao: "CIRCULO" },
  "CÍRCULO": { ferramenta: "circulo", ecoAcao: "CIRCULO" },

  REC: { ferramenta: "retangulo", ecoAcao: "RETANGULO" },
  RECTANGLE: { ferramenta: "retangulo", ecoAcao: "RETANGULO" },
  RETANGULO: { ferramenta: "retangulo", ecoAcao: "RETANGULO" },
  "RETÂNGULO": { ferramenta: "retangulo", ecoAcao: "RETANGULO" },

  POL: { ferramenta: "poligono", ecoAcao: "POLIGONO" },
  POLIGONO: { ferramenta: "poligono", ecoAcao: "POLIGONO" },
  "POLÍGONO": { ferramenta: "poligono", ecoAcao: "POLIGONO" },

  // PL/PLINE = polilinha ABERTA (estilo PLINE real do AutoCAD), distinta
  // do POL acima (que sempre fecha, pensado pra hachura).
  PL: { ferramenta: "polilinha", ecoAcao: "POLILINHA" },
  PLINE: { ferramenta: "polilinha", ecoAcao: "POLILINHA" },
  POLILINHA: { ferramenta: "polilinha", ecoAcao: "POLILINHA" },

  H: { ferramenta: "hachurar", ecoAcao: "HACHURA" },
  HATCH: { ferramenta: "hachurar", ecoAcao: "HACHURA" },
  HACH: { ferramenta: "hachurar", ecoAcao: "HACHURA" },
  HACHURA: { ferramenta: "hachurar", ecoAcao: "HACHURA" },

  // Iteração 41 (pedido do usuário: "altere o nome aparar para trim") --
  // o eco na linha de comando passa a mostrar "TRIM" (nome do botão desde
  // esta iteração, ver `ToolRuler.tsx`); o id interno da ferramenta
  // continua "aparar" (não vale a pena renomear em todo o store/testes só
  // pelo rótulo visível) e os 3 sinônimos digitáveis continuam aceitos.
  TR: { ferramenta: "aparar", ecoAcao: "TRIM" },
  TRIM: { ferramenta: "aparar", ecoAcao: "TRIM" },
  APARAR: { ferramenta: "aparar", ecoAcao: "TRIM" },

  O: { ferramenta: "deslocar", ecoAcao: "OFFSET" },
  OFFSET: { ferramenta: "deslocar", ecoAcao: "OFFSET" },
  DESLOCAR: { ferramenta: "deslocar", ecoAcao: "OFFSET" },

  F: { ferramenta: "concordancia", ecoAcao: "FILLET" },
  FILLET: { ferramenta: "concordancia", ecoAcao: "FILLET" },
  CONCORDANCIA: { ferramenta: "concordancia", ecoAcao: "FILLET" },
  "CONCORDÂNCIA": { ferramenta: "concordancia", ecoAcao: "FILLET" },

  E: { ferramenta: "apagar", ecoAcao: "APAGAR" },
  DEL: { ferramenta: "apagar", ecoAcao: "APAGAR" },
  DELETE: { ferramenta: "apagar", ecoAcao: "APAGAR" },
  ERASE: { ferramenta: "apagar", ecoAcao: "APAGAR" },
  APAGAR: { ferramenta: "apagar", ecoAcao: "APAGAR" },

  S: { ferramenta: "selecionar", ecoAcao: "SELECIONAR" },
  SELECT: { ferramenta: "selecionar", ecoAcao: "SELECIONAR" },
  SELECIONAR: { ferramenta: "selecionar", ecoAcao: "SELECIONAR" },

  M: { ferramenta: "mover", ecoAcao: "MOVER" },
  MOVE: { ferramenta: "mover", ecoAcao: "MOVER" },
  MOVER: { ferramenta: "mover", ecoAcao: "MOVER" },

  CO: { ferramenta: "copiar", ecoAcao: "COPIAR" },
  CP: { ferramenta: "copiar", ecoAcao: "COPIAR" },
  COPY: { ferramenta: "copiar", ecoAcao: "COPIAR" },
  COPIAR: { ferramenta: "copiar", ecoAcao: "COPIAR" },

  T: { ferramenta: "texto", ecoAcao: "TEXTO" },
  TXT: { ferramenta: "texto", ecoAcao: "TEXTO" },
  TEXT: { ferramenta: "texto", ecoAcao: "TEXTO" },
  TEXTO: { ferramenta: "texto", ecoAcao: "TEXTO" },

  DIM: { ferramenta: "cota", ecoAcao: "COTA" },
  DI: { ferramenta: "cota", ecoAcao: "COTA" },
  DIST: { ferramenta: "cota", ecoAcao: "COTA" },
  DIMENSION: { ferramenta: "cota", ecoAcao: "COTA" },
  COTA: { ferramenta: "cota", ecoAcao: "COTA" },

  PE: { ferramenta: "concessionaria", ecoAcao: "PADRAO_ENTRADA" },
  CONC: { ferramenta: "concessionaria", ecoAcao: "PADRAO_ENTRADA" },
  CONCESSIONARIA: { ferramenta: "concessionaria", ecoAcao: "PADRAO_ENTRADA" },
  "CONCESSIONÁRIA": { ferramenta: "concessionaria", ecoAcao: "PADRAO_ENTRADA" },
  PADRAOENTRADA: { ferramenta: "concessionaria", ecoAcao: "PADRAO_ENTRADA" },

  // Viewport / Janela de Impressão (Sprint 5, comando MV/MVIEW).
  MV: { ferramenta: "viewport", ecoAcao: "VIEWPORT" },
  MVIEW: { ferramenta: "viewport", ecoAcao: "VIEWPORT" },

  // ZOOM WINDOW: no AutoCAD real é "Z" seguido de um sub-prompt "W" --
  // aqui os 3 atalhos vão direto pro mesmo comando (o interpretador não
  // tem uma cadeia de sub-opções genérica além dos sub-prompts numéricos/
  // texto já existentes de OFFSET/FILLET/TEXTO, então "Z"/"W" sozinhos já
  // bastam pra cobrir o fluxo "Z -> Enter W" pedido).
  Z: { ferramenta: "zoomWindow", ecoAcao: "ZOOM_WINDOW" },
  W: { ferramenta: "zoomWindow", ecoAcao: "ZOOM_WINDOW" },
  ZW: { ferramenta: "zoomWindow", ecoAcao: "ZOOM_WINDOW" },
};

const COMANDOS_CANCELAR = new Set(["ESC", "CANCEL", "CANCELAR"]);

export function interpretarComando(entradaBruta: string): ResultadoComando {
  const entrada = entradaBruta.trim().toUpperCase();
  if (entrada === "") return { tipo: "desconhecido" };
  if (COMANDOS_CANCELAR.has(entrada)) return { tipo: "cancelar" };

  const item = MAPA_COMANDOS[entrada];
  if (item) return { tipo: "ferramenta", ferramenta: item.ferramenta, ecoAcao: item.ecoAcao };

  return { tipo: "desconhecido" };
}

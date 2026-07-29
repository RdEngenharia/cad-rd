/**
 * temaCanvas.ts
 * -----------------------------------------------------------------------
 * Iteração 44 -- pedido do usuário: "quero que o fundo da tela tenha a
 * opcao de branco e escuro igual no autocad". Guarda a preferência de
 * TEMA do fundo do Desenho (Model Space) -- "claro" (padrão, cinza claro
 * + grid escuro, comportamento de sempre) ou "escuro" (cinza bem escuro +
 * grid claro, mesmo espírito do fundo escuro clássico do AutoCAD).
 *
 * Mesmo padrão de persistência mock-local já usado por `perfilTecnico.ts`/
 * `auth.ts`/`firebase.ts`: localStorage, nunca lança, `null`/falha
 * silenciosa fora do navegador (SSR) ou em modo privado.
 *
 * Deliberadamente NÃO entra em `Projeto`/Firestore -- é uma preferência de
 * EXIBIÇÃO pessoal do dispositivo/navegador (como zoom ou posição da régua
 * de ferramentas), não um dado do projeto em si; um projeto aberto em 2
 * computadores diferentes pode ter temas diferentes, sem afetar o desenho
 * salvo. Some SÓ o fundo/grid do Desenho -- a Prancha (papel) continua
 * sempre branca (o papel impresso é sempre branco, igual ao Layout/Paper
 * Space do AutoCAD, que também não segue o tema do Model Space) e as
 * CORES das camadas/geometria não mudam sozinhas (mesma limitação do
 * AutoCAD pra cores customizadas que não sejam a cor "7"/automática --
 * se um traço ficar com pouco contraste no escuro, o projetista ajusta a
 * cor da camada, já suportado pelo app).
 * -----------------------------------------------------------------------
 */

export type TemaCanvas = "claro" | "escuro";

const CHAVE_TEMA_CANVAS = "cadUnifilar:temaCanvas";

/** Lê o tema salvo (se houver e for um valor válido). `null` fora do navegador, sem nada salvo, ou valor corrompido/desconhecido. */
export function carregarTemaCanvasSalvo(): TemaCanvas | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHAVE_TEMA_CANVAS);
    return raw === "claro" || raw === "escuro" ? raw : null;
  } catch {
    return null;
  }
}

/** Grava o tema escolhido. Falha silenciosa (localStorage indisponível/quota) -- a persistência é um nice-to-have, nunca deve quebrar o toggle em si. */
export function salvarTemaCanvas(tema: TemaCanvas): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE_TEMA_CANVAS, tema);
  } catch {
    // Ignorado de propósito -- ver comentário acima.
  }
}

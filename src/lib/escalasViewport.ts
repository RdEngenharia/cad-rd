/**
 * lib/escalasViewport.ts
 * -----------------------------------------------------------------------
 * Escalas de impressão "padrão" (1:N) mais comuns em desenho técnico/ABNT
 * -- botão de escolha rápida (Iteração 14), equivalente ao comando de
 * zoom/escala "nXP" do AutoCAD: em vez de digitar o número cru no campo
 * de "Escala de impressão", o usuário escolhe direto de uma lista e o
 * `modelScale` do Viewport é ajustado com 1 clique.
 *
 * Iteração 46 -- extraído de `PropertiesPanel.tsx` (onde nasceu) pra um
 * arquivo compartilhado, porque agora TAMBÉM alimenta o menu de escala
 * clicável direto na viewport (`ViewportScaleMenu.tsx`) -- pedido do
 * usuário: "preciso implantar um jeito de colocar um desenho na escala
 * na prancha da viewport, exemplo escala igual o autocad. atualmente so
 * temos zoom window lá na prancha", respondido deixando o controle de
 * escala que já existia (só no painel lateral) mais visível/fácil de
 * achar, direto no canvas.
 */
export const ESCALAS_RAPIDAS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000];

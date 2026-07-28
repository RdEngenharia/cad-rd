/**
 * perfilTecnico.ts
 * -----------------------------------------------------------------------
 * Iteração 27: "Automatize o carimbo para ficar salvo os dados do tecnico
 * responsavel logo e assinatura" -- o usuário desenha vários projetos
 * diferentes (clientes diferentes), mas o RESPONSÁVEL TÉCNICO (nome, CREA,
 * logo da empresa, assinatura/rubrica) é sempre o mesmo -- re-digitar o
 * nome/CREA e reenviar a logo/assinatura em TODO projeto novo é retrabalho
 * puro. Este módulo guarda esse subconjunto do carimbo (só os 4 campos que
 * identificam o TÉCNICO, nunca os campos que mudam por projeto -- cliente,
 * endereço, conta contrato, tipo de ligação, notas, título, escala) num
 * "perfil" separado em localStorage, sobrevivendo a qualquer projeto
 * novo/recarregado -- mesmo padrão de persistência mock-local já usado
 * pela sessão de autenticação (`auth.ts`) e pelos projetos salvos
 * (`firebase.ts`).
 *
 * Uso: `store.ts` salva aqui (mesclando com o que já existia) toda vez que
 * o usuário edita `responsavel`/`crea`/`logoDataUrl`/`assinaturaDataUrl` no
 * carimbo (`atualizarCarimbo`/`setLogoCarimbo`/`setAssinaturaCarimbo`) --
 * "automático" no sentido literal do pedido: não existe nenhum botão
 * "salvar como padrão", a persistência acontece sozinha a cada edição. E
 * lê daqui (só preenchendo campos que ainda estão VAZIOS, nunca sobrescreve
 * um projeto carregado que já tem seus próprios dados) em `garantirIdProjeto`
 * (1ª carga do app) e `novoProjeto` (botão "Novo").
 * -----------------------------------------------------------------------
 */

const CHAVE_PERFIL_TECNICO = "cadUnifilar:perfilResponsavelTecnico";

/** Só os campos do carimbo que identificam o TÉCNICO responsável, nunca os campos por-projeto. */
export interface PerfilResponsavelTecnico {
  responsavel?: string;
  crea?: string;
  logoDataUrl?: string;
  assinaturaDataUrl?: string;
}

/**
 * Lê o perfil salvo (se houver). Retorna `null` em qualquer situação onde
 * não dá pra confiar no valor: fora do navegador (SSR), nada salvo ainda,
 * ou uma entrada corrompida -- mesmo padrão defensivo de
 * `firebase.ts`/`carregarSessaoLocal` (`auth.ts`), nunca lança.
 */
export function carregarPerfilTecnicoSalvo(): PerfilResponsavelTecnico | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHAVE_PERFIL_TECNICO);
    if (!raw) return null;
    return JSON.parse(raw) as PerfilResponsavelTecnico;
  } catch {
    return null;
  }
}

/**
 * Mescla `patch` com o que já estava salvo e regrava. Uma chave presente em
 * `patch` com valor `undefined` APAGA esse campo do perfil salvo (ex.:
 * usuário removeu a logo -- não queremos que ela reapareça no próximo
 * projeto novo).
 */
export function salvarPerfilTecnico(patch: PerfilResponsavelTecnico): void {
  if (typeof window === "undefined") return;
  try {
    const atual = carregarPerfilTecnicoSalvo() ?? {};
    const novo: PerfilResponsavelTecnico = { ...atual, ...patch };
    window.localStorage.setItem(CHAVE_PERFIL_TECNICO, JSON.stringify(novo));
  } catch {
    // localStorage indisponível (modo privado) ou quota estourada (logo/
    // assinatura grandes) -- a auto-persistência é um "nice-to-have" que
    // nunca deve quebrar a edição do carimbo em si, falha silenciosa.
  }
}

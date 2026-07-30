"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useCadStore } from "@/lib/store";
import {
  salvarProjeto,
  carregarProjeto,
  listarProjetosDoUsuario,
  renomearProjeto,
  excluirProjetoSalvo,
} from "@/lib/firebase";
import { exportarProjetoParaArquivo, importarProjetoDeArquivo } from "@/lib/backupProjeto";
import { LoginModal } from "./LoginModal";

function formatarData(epochMs: number): string {
  if (!epochMs) return "--";
  return new Date(epochMs).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * ProjectManagerModal
 * -----------------------------------------------------------------------
 * "Gerenciador de Projetos" (Sprint 3, item 1; reformulado na Iteração 34
 * -- pedido do usuário: "precisamos de um modal para abrir projetos
 * salvos igual do autocad que tem a opcao de criar novo ou abrir um
 * existente"). Agora é a TELA INICIAL do app: abre sozinha assim que o
 * CAD carrega (ver `Editor.tsx`), igual à tela de boas-vindas do AutoCAD/
 * Word ("Novo desenho" / "Abrir desenho existente"), além de continuar
 * disponível a qualquer momento pelo botão "📁 Meus Projetos" da
 * `AuthPanel`. O controle de aberto/fechado mora no store
 * (`gerenciadorProjetosAberto`), não em estado local, porque agora tem
 * mais de um lugar que abre o mesmo modal.
 *
 * Funciona em dois níveis, dependendo do login:
 *   - SEM login: "+ Novo Projeto", "💾 Salvar projeto atual" e "Abrir por
 *     ID" continuam funcionando (mesmo fluxo antigo, sem exigir conta --
 *     preserva o que já existia antes desta iteração, inclusive salvar/
 *     carregar sem login). Em vez da lista de projetos (que depende de
 *     `owner_uid`, só disponível autenticado), mostra um aviso convidando
 *     a entrar/criar conta pra ver os projetos salvos na nuvem.
 *   - COM login: lista completa dos projetos do usuário (abrir/renomear/
 *     excluir), exatamente como já era.
 *
 * A exclusão usa uma confirmação EMBUTIDA no próprio card (2 cliques: o
 * primeiro troca o botão "Excluir" por "Confirmar?"/"Cancelar", só o
 * segundo clique realmente apaga) em vez do `window.confirm()` nativo do
 * navegador -- evita um diálogo bloqueante do sistema operacional dentro
 * de uma UI que já é toda customizada.
 * -----------------------------------------------------------------------
 */
export function ProjectManagerModal() {
  const aberto = useCadStore((s) => s.gerenciadorProjetosAberto);
  const onFechar = useCadStore((s) => s.fecharGerenciadorProjetos);
  const usuario = useCadStore((s) => s.usuario);
  const projeto = useCadStore((s) => s.projeto);
  const projetosSalvos = useCadStore((s) => s.projetosSalvos);
  const setProjetosSalvos = useCadStore((s) => s.setProjetosSalvos);
  const novoProjeto = useCadStore((s) => s.novoProjeto);
  const carregarProjetoNoStore = useCadStore((s) => s.carregarProjeto);
  const abrirAjuda = useCadStore((s) => s.abrirAjuda);
  const marcarProjetoComoSalvo = useCadStore((s) => s.marcarProjetoComoSalvo);

  const [carregandoLista, setCarregandoLista] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null);
  const [loginAberto, setLoginAberto] = useState(false);
  const [mostrarCampoId, setMostrarCampoId] = useState(false);
  const [idParaCarregar, setIdParaCarregar] = useState("");
  // Iteração 45 -- backup manual (.json): input de arquivo escondido,
  // acionado pelo botão de texto "⬆️ Importar arquivo (.json)" (o próprio
  // <input type="file"> nativo é feio/difícil de estilizar de forma
  // consistente com o resto da UI, então fica invisível e um botão comum
  // aciona `.click()` nele -- padrão bem estabelecido para isso).
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  async function recarregarLista() {
    if (!usuario) return;
    setCarregandoLista(true);
    try {
      const lista = await listarProjetosDoUsuario(usuario.uid);
      setProjetosSalvos(lista);
    } catch (e) {
      setErro(String(e));
    } finally {
      setCarregandoLista(false);
    }
  }

  // Recarrega a lista toda vez que o modal abre (não a cada render). O
  // reset roda dentro do callback do rAF (não direto no corpo do efeito)
  // pra não disparar setState síncrono dentro de um efeito -- mesmo
  // padrão de `CalibrationModal.tsx`.
  useEffect(() => {
    if (!aberto) return;
    const id = requestAnimationFrame(() => {
      setErro(null);
      setStatus(null);
      setConfirmandoExclusaoId(null);
      setRenomeandoId(null);
      setMostrarCampoId(false);
      if (usuario) void recarregarLista();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, usuario?.uid]);

  if (!aberto) return null;

  async function handleSalvarAtual() {
    setStatus("Salvando...");
    setErro(null);
    const r = await salvarProjeto(projeto, usuario?.uid ?? null);
    if (r.ok) {
      setStatus(
        `Salvo ✓ (${r.modo === "firestore" ? "nuvem" : "neste dispositivo"}) -- id: ${projeto.id_projeto.slice(0, 8)}…`
      );
      // Iteração 45 -- autosave: este salvamento manual também conta como
      // "estado salvo" de referência, senão o autosave rodaria de novo
      // (achando "sujo") mesmo sem nenhuma edição nova depois deste clique.
      marcarProjetoComoSalvo();
      if (usuario) void recarregarLista();
    } else {
      setErro(r.erro ?? "Erro ao salvar.");
      setStatus(null);
    }
  }

  function handleNovoProjeto() {
    novoProjeto();
    onFechar();
  }

  // Iteração 45 -- backup manual (.json): "quero avisos fáceis e limpos,
  // foque na experiência do usuário" (pedido do usuário) -- por isso as
  // mensagens aqui são curtas e diretas, sem jargão técnico, e o fluxo é
  // só 1 clique (baixar) ou 1 clique + escolher arquivo (importar), sem
  // etapas extras.
  function handleExportarArquivo() {
    exportarProjetoParaArquivo(projeto);
    setErro(null);
    setStatus("Cópia baixada ✓ -- veja a pasta de downloads do seu navegador.");
  }

  function handleClicarImportar() {
    inputArquivoRef.current?.click();
  }

  async function handleArquivoSelecionado(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    // Sempre limpa o valor do input, mesmo em caso de erro -- sem isso,
    // selecionar o MESMO arquivo duas vezes seguidas não dispara `onChange`
    // de novo (o navegador só avisa quando o valor muda).
    e.target.value = "";
    if (!arquivo) return;

    setErro(null);
    setStatus("Lendo arquivo...");
    const r = await importarProjetoDeArquivo(arquivo);
    if (r.ok && r.projeto) {
      carregarProjetoNoStore(r.projeto);
      setStatus(null);
      onFechar();
    } else {
      setErro(r.erro ?? "Não foi possível importar este arquivo.");
      setStatus(null);
    }
  }

  async function handleAbrir(id: string) {
    setStatus("Carregando...");
    setErro(null);
    const r = await carregarProjeto(id);
    if (r.ok && r.projeto) {
      carregarProjetoNoStore(r.projeto);
      onFechar();
    } else {
      setErro(r.erro ?? "Erro ao carregar o projeto.");
      setStatus(null);
    }
  }

  async function handleAbrirPorId() {
    const id = idParaCarregar.trim();
    if (!id) return;
    await handleAbrir(id);
  }

  function iniciarRenomear(id: string, nomeAtual: string) {
    setRenomeandoId(id);
    setNovoNome(nomeAtual);
  }

  async function confirmarRenomear(id: string) {
    const nome = novoNome.trim();
    if (!nome) {
      setRenomeandoId(null);
      return;
    }
    const r = await renomearProjeto(id, nome);
    if (r.ok) {
      setProjetosSalvos(projetosSalvos.map((p) => (p.id_projeto === id ? { ...p, nome } : p)));
    } else {
      setErro(r.erro ?? "Erro ao renomear.");
    }
    setRenomeandoId(null);
  }

  async function handleExcluir(id: string) {
    const r = await excluirProjetoSalvo(id);
    if (r.ok) {
      setProjetosSalvos(projetosSalvos.filter((p) => p.id_projeto !== id));
    } else {
      setErro(r.erro ?? "Erro ao excluir.");
    }
    setConfirmandoExclusaoId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex max-h-[80vh] w-[440px] flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">📁 Projetos</h2>
          {/* Iteração 45 -- pedido do usuário: login agora é OBRIGATÓRIO
              antes de criar/editar/salvar qualquer projeto (antes, "Novo
              Projeto"/"Salvar"/"Abrir por ID" funcionavam sem conta -- de
              propósito, desde a Iteração 34, pra uso 100% local/offline;
              o usuário decidiu mudar esse comportamento agora). Sem
              `usuario`, não existe "fechar e ir pro desenho atual" pra
              fugir do login -- só some daqui quando `usuario` existir. */}
          {usuario && (
            <button type="button" onClick={onFechar} className="text-slate-400 hover:text-slate-600" title="Fechar e ir para o desenho atual">
              ✕
            </button>
          )}
        </div>

        {usuario && (
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
            <button
              type="button"
              onClick={handleNovoProjeto}
              className="rounded border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              + Novo Projeto
            </button>
            <button
              type="button"
              onClick={handleSalvarAtual}
              className="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              💾 Salvar projeto atual
            </button>
          </div>
        )}

        {/* Iteração 45 -- backup manual (.json): segunda linha, discreta
            (texto simples em vez de botões cheios), pra não competir
            visualmente com as ações principais acima -- é um recurso de
            segurança extra, não o fluxo do dia a dia. */}
        {usuario && (
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-1.5 text-[11px]">
            <button type="button" onClick={handleExportarArquivo} className="text-slate-500 hover:text-slate-700 hover:underline">
              ⬇️ Baixar cópia (.json)
            </button>
            <button type="button" onClick={handleClicarImportar} className="text-slate-500 hover:text-slate-700 hover:underline">
              ⬆️ Importar arquivo (.json)
            </button>
            <input ref={inputArquivoRef} type="file" accept=".json" onChange={handleArquivoSelecionado} className="hidden" />
          </div>
        )}

        {status && <p className="px-4 pt-2 text-[11px] text-emerald-600">{status}</p>}
        {erro && <p className="px-4 pt-2 text-[11px] text-red-600">{erro}</p>}

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {!usuario ? (
            <div className="space-y-2 py-2">
              <p className="rounded border border-blue-100 bg-blue-50 p-2 text-[11px] leading-snug text-blue-700">
                É preciso entrar com uma conta (ou criar uma) pra criar, abrir, editar ou salvar qualquer projeto.
              </p>
              <button
                type="button"
                onClick={() => setLoginAberto(true)}
                className="w-full rounded border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                👤 Entrar / Criar conta
              </button>
              {/* Iteração 45 (continuação) -- o usuário voltou pedindo o
                  "campo de ajuda" dentro do app: como o login é obrigatório
                  e este gerenciador cobre a tela inteira antes de logar (sem
                  botão de fechar nesse estado), o manual só ficaria alcançável
                  DEPOIS de criar conta se não estivesse também aqui dentro. */}
              <button
                type="button"
                onClick={abrirAjuda}
                className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                ❓ Ver manual de ajuda (sem precisar de conta)
              </button>
            </div>
          ) : carregandoLista ? (
            <p className="py-4 text-center text-xs text-slate-400">Carregando...</p>
          ) : projetosSalvos.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">
              Nenhum projeto salvo ainda para {usuario.email}. Use &quot;Salvar projeto atual&quot; acima.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {projetosSalvos.map((p) => (
                <li key={p.id_projeto} className="rounded border border-slate-200 p-2">
                  {renomeandoId === p.id_projeto ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={novoNome}
                        onChange={(e) => setNovoNome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmarRenomear(p.id_projeto);
                          if (e.key === "Escape") setRenomeandoId(null);
                        }}
                        className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => confirmarRenomear(p.id_projeto)}
                        className="rounded bg-blue-600 px-2 py-1 text-[11px] text-white"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700" title={p.nome}>
                          {p.nome}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatarData(p.atualizado_em)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {confirmandoExclusaoId === p.id_projeto ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleExcluir(p.id_projeto)}
                              className="rounded bg-red-600 px-1.5 py-1 text-[10px] font-medium text-white"
                            >
                              Confirmar?
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoExclusaoId(null)}
                              className="rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-500"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAbrir(p.id_projeto)}
                              title="Abrir"
                              className="rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                            >
                              Abrir
                            </button>
                            <button
                              type="button"
                              onClick={() => iniciarRenomear(p.id_projeto, p.nome)}
                              title="Renomear"
                              className="rounded border border-slate-200 px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoExclusaoId(p.id_projeto)}
                              title="Excluir"
                              className="rounded border border-slate-200 px-1.5 py-1 text-[10px] text-red-500 hover:bg-red-50"
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Abrir por ID (Iteração 34) -- fluxo antigo que existia solto na
            Toolbar (`Carregar`), agora dentro do modal único: útil pra
            abrir um projeto de outra pessoa (compartilhado por ID, ver
            `firestore.rules` -- leitura é pública por ID). Iteração 45:
            login virou obrigatório pra qualquer ação neste modal, então
            isso só aparece pra quem já está logado (não é mais um atalho
            pra quem não tem conta). */}
        {usuario && (
          <div className="border-t border-slate-100 px-4 py-2">
            {mostrarCampoId ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={idParaCarregar}
                  onChange={(e) => setIdParaCarregar(e.target.value)}
                  placeholder="Cole o id_projeto aqui"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAbrirPorId();
                    if (e.key === "Escape") setMostrarCampoId(false);
                  }}
                  className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
                />
                <button type="button" onClick={handleAbrirPorId} className="rounded bg-slate-700 px-2 py-1 text-xs text-white">
                  Abrir
                </button>
                <button type="button" onClick={() => setMostrarCampoId(false)} className="px-1 text-xs text-slate-400">
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMostrarCampoId(true)}
                className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline"
              >
                Abrir um projeto por ID...
              </button>
            )}
          </div>
        )}
      </div>

      <LoginModal aberto={loginAberto} onFechar={() => setLoginAberto(false)} />
    </div>
  );
}

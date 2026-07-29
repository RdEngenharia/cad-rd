"use client";

import { useCadStore } from "@/lib/store";
import { ehAdmin } from "@/lib/suporte";
import { SuporteChatUsuario } from "./SuporteChatUsuario";
import { SuporteAdminPanel } from "./SuporteAdminPanel";

/**
 * SuportePanel
 * -----------------------------------------------------------------------
 * Wrapper único (montado 1x em `Editor.tsx`, mesmo padrão do
 * `ProjectManagerModal`/`CalibrationModal`): decide, com base no e-mail do
 * usuário logado, qual dos dois painéis de "Sugestões/Suporte" mostrar --
 * o chat comum (`SuporteChatUsuario`) ou, só para `EMAIL_ADMIN`
 * (`lib/suporte.ts`), o painel com todas as conversas (`SuporteAdminPanel`).
 * -----------------------------------------------------------------------
 */
export function SuportePanel() {
  const suporteAberto = useCadStore((s) => s.suporteAberto);
  const fecharSuporte = useCadStore((s) => s.fecharSuporte);
  const usuario = useCadStore((s) => s.usuario);

  if (!suporteAberto || !usuario) return null;

  return ehAdmin(usuario.email) ? (
    <SuporteAdminPanel onFechar={fecharSuporte} />
  ) : (
    <SuporteChatUsuario usuario={usuario} onFechar={fecharSuporte} />
  );
}

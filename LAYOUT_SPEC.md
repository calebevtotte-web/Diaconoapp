# Especificação de Design do Sistema (Layout Spec)

Este documento descreve a identidade visual e os padrões de construção utilizados neste aplicativo para que o layout possa ser replicado com fidelidade.

## 1. Fundamentos Visuais

### Tipografia
- **Sans-serif (UI):** `Inter` (via Google Fonts ou sistema).
- **Display/Labels:** Utilizar `font-black` e `uppercase` com `tracking-widest` para títulos de seções e labels pequenos.
- **Data/Monospace (Opcional):** `JetBrains Mono` para métricas numéricas.

### Paleta de Cores (Tailwind CSS)
- **Fundo Principal:** `bg-slate-50` para contraste suave com os cards.
- **Cards e Superfícies:** `bg-white` com bordas `border-slate-100` ou `border-gray-50`.
- **Acentuação Principal (Emerald):** `emerald-500` (hover), `emerald-600` (primário).
- **Feedback Visual:**
  - `rose-500` para alertas críticos/burnout.
  - `amber-500` para avisos/inatividade.
  - `blue-500` para tendências e info.
- **Sidebar (Dark Mode fixo):** `bg-slate-900` ou `bg-gray-950`.

## 2. Componentes e Estilização

### Cards
- **Raio de Borda:** `rounded-3xl` (30px ou 24px) para um visual moderno e suave.
- **Sombra:** `shadow-sm` padrão. Para elementos flutuantes ou destaque: `shadow-xl shadow-emerald-500/10`.
- **Preenchimento Inner:** Mínimo de `p-6` ou `p-8`.

### Sidebar (Navegação Desktop)
- Largura fixa (~280px).
- Ícones `lucide-react` com `strokeWidth={2}`.
- Estados ativos: Fundo levemente translúcido (`bg-white/10`) e texto branco brilhante.

### Botões e Interatividade
- **Animações:** Uso obrigatório de `motion/react`.
- **Micro-interações:** `active:scale-95` em todos os botões e cards clicáveis.
- **Transições:** `transition-all duration-200`.

## 3. Gráficos (Recharts)
- **Tooltips:** Customizar bordas para `rounded-2xl` e remover bordas padrão.
- **Áreas:** Utilizar gradientes lineares (`stopColor` de `emerald-500` com opacidades de 0.1 a 0).
- **Eixos:** Esconder linhas de eixo (`axisLine={false}`) e ticks (`tickLine={false}`). Usar cores suaves para labels (`text-slate-400`).

## 4. UI Patterns (Dashboards)
- **Bento Grids:** Uso de grids responsivos (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) com gaps generosos (`gap-6` ou `gap-8`).
- **Seções:** Títulos em `text-[10px] font-black uppercase tracking-[0.2em] text-slate-400`.
- **Ícones de Status:** Envolvidos em círculos ou quadrados arredondados com soft background (ex: `bg-emerald-50`).

## 5. Mobile
- **Bottom Navigation:** Fixed bottom, white background, `shadow-[0_-4px_12px_rgba(0,0,0,0.05)]`.
- **Toque:** Alvos de clique com altura mínima de `44px`.

---
*Assinado: AI Coding Assistant (Antigravity Agent)*

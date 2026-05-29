/**
 * SharkScope API client — TypeScript port do shark-reader (Python)
 * Docs: https://www.sharkscope.com/api/iduy/
 *
 * A API trabalha com estatísticas AGREGADAS por filtro.
 * Não retorna hands individuais, mas métricas como ROI, profit, volume, ITM, etc.
 *
 * Auth: username + password como query params (sem OAuth).
 * Rate limit: respeitar 500ms entre requests.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SharkscopeCredentials {
  username: string; // SHARKSCOPE_USERNAME (conta da RegLife)
  password: string; // SHARKSCOPE_PASSWORD
}

/**
 * Sujeito da query: ou um jogador individual, ou um PlayerGroup
 * pré-configurado no SharkScope (multi-skin / multi-conta).
 */
export type SharkscopeSubject =
  | { kind: "player"; identifier: string }
  | { kind: "playergroup"; identifier: string };

/** Estatísticas brutas retornadas pela API */
export interface SharkscopeRawStats {
  Count?: number;        // Número de sessões (groups of tournaments)
  Entries?: number;      // Total de torneios jogados
  AvStake?: number;      // Buy-in médio (USD)
  Profit?: number;       // Profit total (USD)
  AvROI?: number;        // ROI médio por torneio (%)
  TotalROI?: number;     // ROI total (%)
  ITM?: number;          // In-The-Money %
  AvEntrants?: number;   // Média de participantes por torneio
  TurboRatio?: number;   // % de torneios turbo
  FinshesEarly?: number; // % que terminou cedo (bubble, etc.)
  FinshesLate?: number;  // % que terminou tarde (deep runs)
  ReEntries?: number;    // Total de re-entries
  FinalTables?: number;  // Mesas finais
}

/** Resultado processado de uma consulta */
export interface SharkscopeResult {
  player: string;
  network: string;
  filterName: string; // Nome legível: "Overall", "PKO", "BI 5-12", etc.
  filterQuery: string;
  stats: SharkscopeRawStats;
  profileUrl: string;
  success: true;
}

export interface SharkscopeError {
  player: string;
  network: string;
  error: string;
  success: false;
}

export interface SharkscopeBlocked {
  player: string;
  network: string;
  blocked: true;
  success: false;
}

export type SharkscopeResponse = SharkscopeResult | SharkscopeError | SharkscopeBlocked;

/** Snapshot completo de um jogador para o Manager.IA usar */
export interface PlayerSnapshot {
  player: string;
  network: string;
  fetchedAt: string; // ISO timestamp

  // Visão geral
  overall: SharkscopeRawStats | null;
  pko: SharkscopeRawStats | null;
  nPko: SharkscopeRawStats | null;

  // Por buy-in (para entender o nível atual do jogador)
  byBuyin: {
    range: string;          // "BI 5-12", "BI 12-26", etc.
    filterQuery: string;
    stats: SharkscopeRawStats;
  }[];

  // Métricas derivadas
  pkoRatio: number | null;   // % dos torneios que são PKO
  avgBuyin: number | null;   // Buy-in médio geral
  winrate: string | null;    // "Vencedor" | "Breakeven" | "Perdendo"
}

// ---------------------------------------------------------------------------
// Filtros padrão da RegLife (espelho do FilterManager do shark-reader)
// ---------------------------------------------------------------------------

/** Filtro base: exclui sats/freerolls, só NLHE agendados */
const BASE_FILTER = "TournamentName!:Sat:,Freeroll;Class:SCHEDULED;Type:H,NL";

export const SHARKSCOPE_FILTERS: Record<string, string> = {
  Overall: `${BASE_FILTER};Date:*`,
  PKO: `Type:B;${BASE_FILTER};Date:*`,
  nPKO: `Type!:B;${BASE_FILTER};Date:*`,
  "BI 0-4.99": `StakePlusRake:USD0~4.99,EUR0~4.99;${BASE_FILTER};Date:*`,
  "BI 5-12": `StakePlusRake:USD5~12,EUR5~12;${BASE_FILTER};Date:*`,
  "BI 12-26": `StakePlusRake:USD12~26,EUR12~26;${BASE_FILTER};Date:*`,
  "BI 26-46": `StakePlusRake:USD26~46,EUR26~46;${BASE_FILTER};Date:*`,
  "BI 46-70": `StakePlusRake:USD46~70,EUR46~70;${BASE_FILTER};Date:*`,
  "BI 70-126": `StakePlusRake:USD70~126,EUR70~126;${BASE_FILTER};Date:*`,
  "BI 126+": `StakePlusRake:USD126~*,EUR126~*;${BASE_FILTER};Date:*`,
};

/** Filtros usados no snapshot completo do Manager.IA */
const SNAPSHOT_FILTERS = ["Overall", "PKO", "nPKO", "BI 5-12", "BI 12-26", "BI 26-46"];

// Estatísticas solicitadas em cada query
const STATISTICS =
  "Count,Entries,AvStake,Profit,AvROI,TotalROI,ITM,AvEntrants,TurboRatio,FinshesEarly,FinshesLate,ReEntries,FinalTables";

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export class SharkscopeClient {
  // O path da SharkScope segue `/api/<API_USERNAME>/networks/...`. `iduy` é o
  // exemplo das docs e NÃO funciona com credenciais de outras contas — quem
  // copiou o snippet original deixou o placeholder. Construímos a base a
  // partir do username real.
  private readonly baseUrl: string;
  private lastRequestAt = 0;
  private readonly minIntervalMs = 600; // 600ms — um pouco mais conservador que o Python

  constructor(private readonly creds: SharkscopeCredentials) {
    this.baseUrl = `https://www.sharkscope.com/api/${encodeURIComponent(creds.username)}/networks`;
  }

  // ---- Pública -------------------------------------------------------

  /**
   * Busca estatísticas de um jogador com um filtro específico.
   */
  async fetchStats(
    player: string,
    network: string,
    filterName: keyof typeof SHARKSCOPE_FILTERS | string,
    filterQuery?: string
  ): Promise<SharkscopeResponse> {
    return this.fetchSubjectStats(
      { kind: "player", identifier: player },
      network,
      filterName,
      filterQuery
    );
  }

  /**
   * Versão para PlayerGroup do SharkScope — usada quando o admin liga o
   * grupo do aluno (multi-skin / multi-conta). Mesmo formato de retorno;
   * o consumer não precisa diferenciar.
   */
  async fetchGroupStats(
    groupId: string,
    network: string,
    filterName: keyof typeof SHARKSCOPE_FILTERS | string,
    filterQuery?: string
  ): Promise<SharkscopeResponse> {
    return this.fetchSubjectStats(
      { kind: "playergroup", identifier: groupId },
      network,
      filterName,
      filterQuery
    );
  }

  /**
   * Busca snapshot completo do jogador (todos os filtros relevantes).
   * Usa para alimentar o Manager.IA com contexto completo.
   */
  async fetchPlayerSnapshot(
    player: string,
    network: string
  ): Promise<PlayerSnapshot> {
    return this.fetchSubjectSnapshot({ kind: "player", identifier: player }, network);
  }

  /**
   * Mesmo que fetchPlayerSnapshot mas para PlayerGroup.
   */
  async fetchGroupSnapshot(
    groupId: string,
    network: string
  ): Promise<PlayerSnapshot> {
    return this.fetchSubjectSnapshot(
      { kind: "playergroup", identifier: groupId },
      network
    );
  }

  /**
   * Stats de um mês específico (não cumulativo). Usa o filtro Date: do
   * SharkScope com range inicio~fim do mês. Útil pro histórico mensal.
   *
   * Devolve o SharkscopeResponse completo pra o caller distinguir entre
   * sucesso (`success: true`), conta bloqueada por privacy (`blocked: true`)
   * e erro real (`error: string` — player not found, 5xx, rede, etc).
   */
  async fetchMonthlyStats(
    subject: SharkscopeSubject,
    network: string,
    year: number,
    month: number
  ): Promise<SharkscopeResponse> {
    const { startDate, endDate } = monthRange(year, month);
    const filterQuery = `${BASE_FILTER};Date:${startDate}~${endDate}`;
    return this.fetchSubjectStats(
      subject,
      network,
      `Monthly-${year}-${month}`,
      filterQuery
    );
  }

  // ---- Internos compartilhados ---------------------------------------

  private async fetchSubjectStats(
    subject: SharkscopeSubject,
    network: string,
    filterName: keyof typeof SHARKSCOPE_FILTERS | string,
    filterQuery?: string
  ): Promise<SharkscopeResponse> {
    const query = filterQuery ?? SHARKSCOPE_FILTERS[filterName];
    if (!query) {
      return {
        player: subject.identifier,
        network,
        error: `Filtro desconhecido: ${filterName}`,
        success: false,
      };
    }

    await this.rateLimit();
    const url = this.buildUrl(network, subject, query);
    return this.requestWithRetry(
      url,
      subject.identifier,
      network,
      filterName,
      query,
      subject
    );
  }

  private async fetchSubjectSnapshot(
    subject: SharkscopeSubject,
    network: string
  ): Promise<PlayerSnapshot> {
    const results = await Promise.allSettled(
      SNAPSHOT_FILTERS.map((name) => this.fetchSubjectStats(subject, network, name))
    );

    const byName: Record<string, SharkscopeRawStats | null> = {};
    for (let i = 0; i < SNAPSHOT_FILTERS.length; i++) {
      const r = results[i];
      const name = SNAPSHOT_FILTERS[i];
      if (r.status === "fulfilled" && r.value.success) {
        byName[name] = (r.value as SharkscopeResult).stats;
      } else {
        byName[name] = null;
      }
    }

    const overall = byName["Overall"];
    const pko = byName["PKO"];

    // Deriva métricas compostas
    const pkoRatio =
      overall?.Entries && pko?.Entries
        ? Math.round((pko.Entries / overall.Entries) * 100)
        : null;

    const avgBuyin = overall?.AvStake ?? null;

    let winrate: string | null = null;
    if (overall?.AvROI !== undefined) {
      if (overall.AvROI > 5) winrate = "Vencedor";
      else if (overall.AvROI >= -5) winrate = "Breakeven";
      else winrate = "Perdendo";
    }

    const buyinFilters = ["BI 5-12", "BI 12-26", "BI 26-46"];
    const byBuyin = buyinFilters
      .filter((b) => byName[b] !== null)
      .map((b) => ({
        range: b,
        filterQuery: SHARKSCOPE_FILTERS[b],
        stats: byName[b]!,
      }));

    return {
      player: subject.identifier,
      network,
      fetchedAt: new Date().toISOString(),
      overall,
      pko: byName["PKO"],
      nPko: byName["nPKO"],
      byBuyin,
      pkoRatio,
      avgBuyin,
      winrate,
    };
  }

  // ---- Privadas -------------------------------------------------------

  private buildUrl(
    network: string,
    subject: SharkscopeSubject,
    filterQuery: string
  ): string {
    const params = new URLSearchParams({
      Username: this.creds.username,
      Password: this.creds.password,
      filter: filterQuery,
    });
    const segment = subject.kind === "playergroup" ? "playergroups" : "players";
    return `${this.baseUrl}/${network}/${segment}/${encodeURIComponent(subject.identifier)}/statistics/${STATISTICS}?${params}`;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const wait = this.minIntervalMs - (now - this.lastRequestAt);
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private async requestWithRetry(
    url: string,
    player: string,
    network: string,
    filterName: string,
    filterQuery: string,
    subject: SharkscopeSubject = { kind: "player", identifier: player },
    maxRetries = 3
  ): Promise<SharkscopeResponse> {
    let delay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          next: { revalidate: 0 }, // Never cache — dados precisam ser frescos
        });

        if (res.status === 200) {
          const data = await res.json();
          return this.processResponse(data, player, network, filterName, filterQuery, subject);
        }

        if (res.status === 429) {
          await sleep(delay * 2);
          delay *= 2;
          continue;
        }

        if ([500, 502, 503, 504].includes(res.status)) {
          await sleep(delay);
          delay *= 1.5;
          continue;
        }

        return { player, network, error: `HTTP ${res.status}`, success: false };
      } catch (err) {
        if (attempt === maxRetries - 1) {
          return {
            player,
            network,
            error: err instanceof Error ? err.message : "Erro de rede",
            success: false,
          };
        }
        await sleep(delay);
        delay *= 1.5;
      }
    }

    return { player, network, error: "Máximo de tentativas excedido", success: false };
  }

  private processResponse(
    data: unknown,
    player: string,
    network: string,
    filterName: string,
    filterQuery: string,
    subject: SharkscopeSubject = { kind: "player", identifier: player }
  ): SharkscopeResponse {
    try {
      const response = (data as any)?.Response;

      // SharkScope responde HTTP 200 com `@success:"false"` quando o request é
      // sintaticamente válido mas falha por auth/quota/etc. Sem isso aqui,
      // erros viram snapshot vazio silencioso (parseStatistics([]) → {}).
      if (response?.["@success"] === "false") {
        const err = response.ErrorResponse?.Error;
        const code = err?.["@id"];
        const msg = err?.["$"] ?? "@success:false sem detalhes";
        return {
          player,
          network,
          error: code ? `SharkScope ${code}: ${msg}` : `SharkScope: ${msg}`,
          success: false,
        };
      }

      const responseData = response?.PlayerResponse?.PlayerView ?? {};

      // Verifica se está bloqueado (privacidade)
      const icon = responseData?.PlayerGroup?.Icon ?? responseData?.Player?.Icon;
      if (icon?.["@type"] === "blocked") {
        return { player, network, blocked: true, success: false };
      }

      let statistics: unknown[] = [];
      if (responseData?.PlayerGroup?.Statistics?.Statistic) {
        statistics = responseData.PlayerGroup.Statistics.Statistic;
      } else if (responseData?.Player?.Statistics?.Statistic) {
        statistics = responseData.Player.Statistics.Statistic;
      }

      const stats = this.parseStatistics(
        Array.isArray(statistics) ? statistics : [statistics]
      );

      const segment =
        subject.kind === "playergroup" ? "playergroups" : "players";
      const profileUrl = `https://pt.sharkscope.com/#Player-Statistics/Advanced-Search//networks/${network}/${segment}/${encodeURIComponent(subject.identifier)}?filter=${filterQuery}`;

      return {
        player,
        network,
        filterName,
        filterQuery,
        stats,
        profileUrl,
        success: true,
      };
    } catch (err) {
      return {
        player,
        network,
        error: `Erro ao processar resposta: ${err instanceof Error ? err.message : err}`,
        success: false,
      };
    }
  }

  private parseStatistics(statistics: unknown[]): SharkscopeRawStats {
    const result: SharkscopeRawStats = {};
    for (const stat of statistics) {
      if (typeof stat !== "object" || stat === null) continue;
      const id = (stat as any)["@id"] as string | undefined;
      const raw = (stat as any)["$"];
      if (!id) continue;

      let value: number | string = raw;
      if (typeof raw === "string" && raw !== "") {
        const n = Number(raw);
        if (!isNaN(n)) value = n;
      }

      (result as any)[id] = value;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Helpers de formatação (reutilizados pelo Manager e pela UI)
// ---------------------------------------------------------------------------

export function formatProfit(value: number | undefined): string {
  if (value === undefined) return "N/A";
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
}

export function formatROI(value: number | undefined): string {
  if (value === undefined) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatITM(value: number | undefined): string {
  if (value === undefined) return "N/A";
  return `${value.toFixed(1)}%`;
}

/** Gera um resumo textual do snapshot para injetar no prompt do Manager.IA */
export function snapshotToText(snap: PlayerSnapshot): string {
  const o = snap.overall;
  if (!o) return "Nenhum dado SharkScope disponível para esse jogador.";

  const lines: string[] = [
    `=== SharkScope: ${snap.player} @ ${snap.network} (atualizado ${new Date(snap.fetchedAt).toLocaleDateString("pt-BR")}) ===`,
    `Torneios jogados: ${o.Entries ?? "N/A"} | Buy-in médio: $${o.AvStake?.toFixed(2) ?? "N/A"}`,
    `Profit total: ${formatProfit(o.Profit)} | ROI médio: ${formatROI(o.AvROI)} | ITM: ${formatITM(o.ITM)}`,
    `Mesas finais: ${o.FinalTables ?? "N/A"} | Termina fundo (late): ${o.FinshesLate ? o.FinshesLate.toFixed(1) + "%" : "N/A"}`,
    snap.pkoRatio !== null ? `PKO%: ${snap.pkoRatio}% dos torneios são Bounty` : "",
    snap.winrate ? `Classificação: ${snap.winrate}` : "",
  ];

  if (snap.byBuyin.length > 0) {
    lines.push("\nPor faixa de buy-in:");
    for (const b of snap.byBuyin) {
      if (!b.stats.Entries) continue;
      lines.push(
        `  ${b.range}: ${b.stats.Entries} torneios | ROI ${formatROI(b.stats.AvROI)} | Profit ${formatProfit(b.stats.Profit)}`
      );
    }
  }

  return lines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Utilidade
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retorna o range YYYY-MM-DD ~ YYYY-MM-DD do mês solicitado. */
function monthRange(year: number, month: number): { startDate: string; endDate: string } {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // dia 0 do próximo = último do atual
  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

// ---------------------------------------------------------------------------
// Histórico mensal (3 meses) injetado no contexto do EV
// ---------------------------------------------------------------------------

/**
 * Forma mínima usada pelo EV. Mapeia 1-pra-1 às colunas de
 * sharkscope_monthly_stats que o formatador consome. Outras colunas
 * (avg_stake, total_roi, etc.) existem na tabela mas não entram no
 * prompt — mantém o contexto curto.
 */
export interface MonthlyStatsRow {
  year: number;
  month: number;
  entries: number | null;
  profit: number | null;
  avg_roi: number | null;
  itm: number | null;
  final_tables: number | null;
}

const MONTH_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Renderiza até 3 meses em texto pra injetar no system prompt do EV.
 * Devolve "" quando `rows.length === 0` — o caller deve filtrar.
 *
 * Regras:
 *  - Ordem preservada (caller envia mais recente → mais antigo)
 *  - Mês `(currentYear, currentMonth)` ganha sufixo "(em andamento)"
 *  - entries null/undefined renderiza como "0 torneios"
 *  - profit/avg_roi/itm usam os formatadores existentes (formatProfit,
 *    formatROI, formatITM); null/undefined viram "N/A"
 */
export function monthlyHistoryToText(
  rows: MonthlyStatsRow[],
  opts?: { currentYear: number; currentMonth: number }
): string {
  if (rows.length === 0) return "";
  const lines: string[] = ["=== ÚLTIMOS MESES (SharkScope) ==="];
  for (const r of rows) {
    const label = `${MONTH_PT[r.month - 1] ?? String(r.month)}/${r.year}`;
    const inProgress =
      opts != null && r.year === opts.currentYear && r.month === opts.currentMonth;
    const head = inProgress ? `${label} (em andamento)` : label;
    const entriesStr = `${r.entries ?? 0} torneios`;
    const profitStr = `profit ${formatProfit(r.profit ?? undefined)}`;
    const roiStr = `ROI ${formatROI(r.avg_roi ?? undefined)}`;
    const itmStr = `ITM ${formatITM(r.itm ?? undefined)}`;
    lines.push(`${head}: ${entriesStr} | ${profitStr} | ${roiStr} | ${itmStr}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Singleton helper para uso server-side
// ---------------------------------------------------------------------------
let _client: SharkscopeClient | null = null;

export function getSharkscopeClient(): SharkscopeClient {
  if (!_client) {
    const username = process.env.SHARKSCOPE_USERNAME;
    const password = process.env.SHARKSCOPE_PASSWORD;
    if (!username || !password) {
      throw new Error(
        "SHARKSCOPE_USERNAME e SHARKSCOPE_PASSWORD devem estar configurados no .env.local"
      );
    }
    _client = new SharkscopeClient({ username, password });
  }
  return _client;
}

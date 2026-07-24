import {
  type Database,
  type IncidentSummary,
  type MonitorSummary,
  type RecentCheck,
  type SeriesGranularity,
  type SeriesPoint,
  StatsRepository,
  type WorkspaceOverview,
} from '@ping/db';

export type StatsWindow = '24h' | '7d' | '30d';

interface WindowSpec {
  readonly from: Date;
  readonly to: Date;
  readonly granularity: SeriesGranularity;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Read-only statistics use cases backing the dashboard and charts. */
export class StatsService {
  constructor(private readonly db: Database) {}

  workspaceOverview(workspaceId: string): Promise<WorkspaceOverview> {
    return new StatsRepository(this.db).workspaceOverview(workspaceId);
  }

  summary(monitorId: string, window: StatsWindow): Promise<MonitorSummary> {
    return new StatsRepository(this.db).monitorSummary(monitorId, this.resolveWindow(window).from);
  }

  series(monitorId: string, window: StatsWindow): Promise<SeriesPoint[]> {
    const spec = this.resolveWindow(window);
    return new StatsRepository(this.db).series(monitorId, spec.from, spec.to, spec.granularity);
  }

  recentChecks(monitorId: string, limit: number): Promise<RecentCheck[]> {
    return new StatsRepository(this.db).recentChecks(monitorId, limit);
  }

  incidents(monitorId: string, limit: number): Promise<IncidentSummary[]> {
    return new StatsRepository(this.db).listIncidents(monitorId, limit);
  }

  private resolveWindow(window: StatsWindow): WindowSpec {
    const to = new Date();
    switch (window) {
      case '24h':
        return { from: new Date(to.getTime() - 24 * HOUR_MS), to, granularity: 'hour' };
      case '7d':
        return { from: new Date(to.getTime() - 7 * DAY_MS), to, granularity: 'day' };
      case '30d':
        return { from: new Date(to.getTime() - 30 * DAY_MS), to, granularity: 'day' };
    }
  }
}

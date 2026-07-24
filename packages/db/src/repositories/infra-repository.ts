import type { Queryable } from '../pool.js';
import type { RegionRecord } from './models.js';

/** Probe regions and worker-instance heartbeats. */
export class InfraRepository {
  constructor(private readonly db: Queryable) {}

  async listRegions(enabledOnly = false): Promise<RegionRecord[]> {
    const res = await this.db.query<{
      id: number;
      code: string;
      name: string;
      enabled: boolean;
    }>(
      `SELECT id, code, name, enabled FROM probe_regions
       ${enabledOnly ? 'WHERE enabled' : ''}
       ORDER BY id`,
    );
    return res.rows;
  }

  async findRegionByCode(code: string): Promise<RegionRecord | null> {
    const res = await this.db.query<{
      id: number;
      code: string;
      name: string;
      enabled: boolean;
    }>('SELECT id, code, name, enabled FROM probe_regions WHERE code = $1', [code]);
    return res.rows[0] ?? null;
  }

  /** Record a worker heartbeat (upsert on region+instance). */
  async heartbeat(regionId: number, instance: string, version: string | null): Promise<void> {
    await this.db.query(
      `INSERT INTO probes (region_id, instance, version, last_heartbeat_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (region_id, instance)
       DO UPDATE SET last_heartbeat_at = now(), version = EXCLUDED.version`,
      [regionId, instance, version],
    );
  }
}

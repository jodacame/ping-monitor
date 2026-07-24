import { type Database, InfraRepository, type RegionRecord } from '@ping/db';

/** Read access to infrastructure metadata (probe regions) for the UI/API. */
export class InfraService {
  constructor(private readonly db: Database) {}

  listRegions(): Promise<RegionRecord[]> {
    return new InfraRepository(this.db).listRegions(true);
  }
}

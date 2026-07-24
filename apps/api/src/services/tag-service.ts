import { NotFoundError } from '@ping/core';
import { type Database, type TagRecord, TagRepository } from '@ping/db';

const DEFAULT_COLOR = '#64748b';

/** Tag use cases: list, create (upsert by name), delete. */
export class TagService {
  constructor(private readonly db: Database) {}

  list(workspaceId: string): Promise<TagRecord[]> {
    return new TagRepository(this.db).list(workspaceId);
  }

  create(workspaceId: string, name: string, color?: string): Promise<TagRecord> {
    return new TagRepository(this.db).create(workspaceId, name.trim(), color ?? DEFAULT_COLOR);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const deleted = await new TagRepository(this.db).delete(id, workspaceId);
    if (!deleted) throw new NotFoundError('Tag not found');
  }
}

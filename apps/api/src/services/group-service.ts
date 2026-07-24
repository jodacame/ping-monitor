import { NotFoundError, newId } from '@ping/core';
import {
  type Database,
  type MonitorGroupRecord,
  MonitorGroupRepository,
} from '@ping/db';

/** Public group shape returned by the API. */
export function groupToDto(group: MonitorGroupRecord): Record<string, unknown> {
  return {
    id: group.publicId,
    name: group.name,
    sortOrder: group.sortOrder,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

/** Monitor-group use cases (one-level folders). */
export class GroupService {
  constructor(private readonly db: Database) {}

  list(workspaceId: string): Promise<MonitorGroupRecord[]> {
    return new MonitorGroupRepository(this.db).list(workspaceId);
  }

  create(
    workspaceId: string,
    input: { name: string; sortOrder?: number },
  ): Promise<MonitorGroupRecord> {
    return new MonitorGroupRepository(this.db).create({
      publicId: newId(),
      workspaceId,
      name: input.name.trim(),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
  }

  async update(
    workspaceId: string,
    publicId: string,
    input: { name?: string; sortOrder?: number },
  ): Promise<MonitorGroupRecord> {
    const updated = await new MonitorGroupRepository(this.db).update(publicId, workspaceId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
    if (!updated) throw new NotFoundError('Group not found');
    return updated;
  }

  async delete(workspaceId: string, publicId: string): Promise<void> {
    const deleted = await new MonitorGroupRepository(this.db).delete(publicId, workspaceId);
    if (!deleted) throw new NotFoundError('Group not found');
  }
}

import { NotFoundError, newId } from '@ping/core';
import {
  type Database,
  MonitorRepository,
  type PublicStatusPage,
  StatsRepository,
  type StatusPageRecord,
  StatusPageRepository,
} from '@ping/db';
import { randomSlugSuffix, slugify } from '../util/slug.js';

export interface StatusPageView extends StatusPageRecord {
  readonly monitorIds: string[];
}

export function statusPageToDto(page: StatusPageView): Record<string, unknown> {
  return {
    id: page.publicId,
    slug: page.slug,
    title: page.title,
    description: page.description,
    monitorIds: page.monitorIds,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

export interface UpsertStatusPageInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly slug?: string;
  readonly monitorIds?: string[];
}

/** Public status-page use cases (management + the public read view). */
export class StatusPageService {
  constructor(private readonly db: Database) {}

  async create(
    workspaceId: string,
    input: { title: string } & UpsertStatusPageInput,
  ): Promise<StatusPageView> {
    const slug = await this.uniqueSlug(input.slug?.trim() || input.title);
    const page = await this.db.transaction(async (tx) => {
      const repo = new StatusPageRepository(tx);
      const created = await repo.create({
        publicId: newId(),
        workspaceId,
        slug,
        title: input.title.trim(),
        description: input.description?.trim() || null,
      });
      if (input.monitorIds?.length) {
        const internal = await new MonitorRepository(tx).resolveInternalIds(
          workspaceId,
          input.monitorIds,
        );
        await repo.setMonitors(created.id, internal);
      }
      return created;
    });
    return this.get(workspaceId, page.publicId);
  }

  list(workspaceId: string): Promise<StatusPageRecord[]> {
    return new StatusPageRepository(this.db).list(workspaceId);
  }

  async get(workspaceId: string, publicId: string): Promise<StatusPageView> {
    const repo = new StatusPageRepository(this.db);
    const page = await repo.findByPublicId(publicId, workspaceId);
    if (!page) throw new NotFoundError('Status page not found');
    const monitorIds = await repo.listMonitorPublicIds(page.id);
    return { ...page, monitorIds };
  }

  async update(
    workspaceId: string,
    publicId: string,
    input: UpsertStatusPageInput,
  ): Promise<StatusPageView> {
    const existing = await this.get(workspaceId, publicId);
    const slug =
      input.slug && input.slug.trim() !== existing.slug
        ? await this.uniqueSlug(input.slug, publicId)
        : undefined;

    await this.db.transaction(async (tx) => {
      const repo = new StatusPageRepository(tx);
      await repo.update(publicId, workspaceId, {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(slug !== undefined ? { slug } : {}),
      });
      if (input.monitorIds !== undefined) {
        const internal = await new MonitorRepository(tx).resolveInternalIds(
          workspaceId,
          input.monitorIds,
        );
        await repo.setMonitors(existing.id, internal);
      }
    });
    return this.get(workspaceId, publicId);
  }

  async delete(workspaceId: string, publicId: string): Promise<void> {
    const deleted = await new StatusPageRepository(this.db).delete(publicId, workspaceId);
    if (!deleted) throw new NotFoundError('Status page not found');
  }

  /** Public read view by slug, enriched with 24h uptime + heartbeat bars. */
  async getPublic(slug: string): Promise<Record<string, unknown> | null> {
    const page: PublicStatusPage | null = await new StatusPageRepository(this.db).getPublicBySlug(
      slug,
    );
    if (!page) return null;
    const ids = page.monitors.map((m) => m.id);
    const stats = await new StatsRepository(this.db).miniStats(ids);
    return {
      title: page.title,
      description: page.description,
      updatedAt: page.updatedAt,
      monitors: page.monitors.map((m) => {
        const s = stats.get(m.id);
        return {
          name: m.name,
          status: m.status,
          uptime24h: s?.uptime24h ?? null,
          bars: s?.bars ?? [],
        };
      }),
    };
  }

  private async uniqueSlug(base: string, exceptPublicId?: string): Promise<string> {
    const repo = new StatusPageRepository(this.db);
    const root = slugify(base) || 'status';
    if (!(await repo.slugExists(root, exceptPublicId))) return root;
    for (let i = 0; i < 5; i++) {
      const candidate = `${root}-${randomSlugSuffix(2)}`;
      if (!(await repo.slugExists(candidate, exceptPublicId))) return candidate;
    }
    return `${root}-${randomSlugSuffix(4)}`;
  }
}

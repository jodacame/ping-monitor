import type { MonitorRecord } from '@ping/db';
import type { MonitorView } from '../services/monitor-service.js';

/**
 * Serializers map internal domain records to the public API shape: `publicId`
 * becomes `id`, internal keys are dropped, enums are already strings. Dates are
 * serialized to ISO-8601 by Fastify's JSON encoder.
 */
export function monitorToDto(monitor: MonitorRecord | MonitorView): Record<string, unknown> {
  return {
    id: monitor.publicId,
    name: monitor.name,
    type: monitor.type,
    target: monitor.target,
    config: monitor.config,
    intervalSeconds: monitor.intervalSeconds,
    timeoutMs: monitor.timeoutMs,
    failureThreshold: monitor.failureThreshold,
    recoveryThreshold: monitor.recoveryThreshold,
    quorum: monitor.quorum,
    enabled: monitor.enabled,
    status: monitor.status,
    lastCheckedAt: monitor.lastCheckedAt,
    lastStatusChangedAt: monitor.lastStatusChangedAt,
    lastResponseMs: monitor.lastResponseMs,
    groupId: monitor.groupId,
    groupName: monitor.groupName,
    createdAt: monitor.createdAt,
    updatedAt: monitor.updatedAt,
    ...('regionIds' in monitor ? { regionIds: monitor.regionIds } : {}),
  };
}

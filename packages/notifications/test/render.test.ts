import { describe, expect, it } from 'vitest';
import { DomainEventType, type MonitorStatusChangedEvent } from '@ping/core';
import { eventToNotification, renderTemplate, shouldNotify } from '../src/index.js';

const baseEvent: MonitorStatusChangedEvent = {
  type: DomainEventType.MonitorStatusChanged,
  monitorId: '01ABC',
  workspaceId: '01WS',
  monitorName: 'API',
  from: 'up',
  to: 'down',
  at: '2026-07-24T15:00:00.000Z',
  responseMs: null,
  error: { kind: 'timeout', message: 'Request timed out' },
};

describe('shouldNotify', () => {
  it('alerts on going down and on recovery from down', () => {
    expect(shouldNotify('up', 'down')).toBe(true);
    expect(shouldNotify('pending', 'down')).toBe(true);
    expect(shouldNotify('down', 'up')).toBe(true);
  });

  it('stays quiet on first-check success and administrative changes', () => {
    expect(shouldNotify('pending', 'up')).toBe(false);
    expect(shouldNotify('up', 'paused')).toBe(false);
    expect(shouldNotify('up', 'up')).toBe(false);
  });
});

describe('eventToNotification', () => {
  it('renders a critical notification with the failure reason', () => {
    const n = eventToNotification(baseEvent);
    expect(n.severity).toBe('critical');
    expect(n.title).toContain('DOWN');
    expect(n.message).toContain('Request timed out');
    expect(n.status).toBe('down');
    expect(n.previousStatus).toBe('up');
  });

  it('renders a recovery notification with latency', () => {
    const n = eventToNotification({ ...baseEvent, from: 'down', to: 'up', responseMs: 123, error: undefined });
    expect(n.severity).toBe('recovery');
    expect(n.message).toContain('123 ms');
  });
});

describe('renderTemplate', () => {
  it('substitutes known variables and blanks unknown ones', () => {
    const out = renderTemplate('{{title}} @ {{status}} [{{missing}}]', {
      title: 'API down',
      status: 'down',
    });
    expect(out).toBe('API down @ down []');
  });
});

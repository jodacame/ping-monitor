import { Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button, IconButton, Input, Select } from './ui';

/**
 * Visual builder for HTTP health assertions. Supports a single group (match
 * ALL / ANY) of simple conditions — the common case — mapping to the backend's
 * `{ logic, rules }` shape. The engine also supports nested groups; this UI
 * keeps the flat form for clarity.
 */

export type AssertionSource = 'status' | 'response_time' | 'body' | 'header' | 'json';
export type AssertionOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'regex'
  | 'exists'
  | 'not_exists';

export interface Assertion {
  source: AssertionSource;
  path?: string;
  op: AssertionOp;
  value?: string;
}

export interface AssertionGroup {
  logic: 'and' | 'or';
  rules: Assertion[];
}

const SOURCES: { value: AssertionSource; label: string }[] = [
  { value: 'status', label: 'Status code' },
  { value: 'response_time', label: 'Response time (ms)' },
  { value: 'body', label: 'Body text' },
  { value: 'json', label: 'JSON value' },
  { value: 'header', label: 'Header' },
];

const OPERATORS: { value: AssertionOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: "doesn't contain" },
  { value: 'regex', label: 'matches regex' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: "doesn't exist" },
];

function needsPath(source: AssertionSource): boolean {
  return source === 'json' || source === 'header';
}
function needsValue(op: AssertionOp): boolean {
  return op !== 'exists' && op !== 'not_exists';
}

export function AssertionsBuilder({
  value,
  onChange,
}: {
  value: AssertionGroup | null;
  onChange: (next: AssertionGroup | null) => void;
}) {
  const group: AssertionGroup = value ?? { logic: 'and', rules: [] };

  const update = (next: AssertionGroup): void => {
    onChange(next.rules.length === 0 ? null : next);
  };

  const setRule = (index: number, patch: Partial<Assertion>): void => {
    const rules = group.rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    update({ ...group, rules });
  };
  const addRule = (): void => {
    update({ ...group, rules: [...group.rules, { source: 'status', op: 'eq', value: '200' }] });
  };
  const removeRule = (index: number): void => {
    update({ ...group, rules: group.rules.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>Consider the check healthy when</span>
        <Select
          value={group.logic}
          onChange={(e) => update({ ...group, logic: e.target.value as 'and' | 'or' })}
          className="h-8 w-auto py-0 text-xs"
        >
          <option value="and">ALL</option>
          <option value="or">ANY</option>
        </Select>
        <span>of these match:</span>
      </div>

      {group.rules.length > 0 && (
        <div className="space-y-2">
          {group.rules.map((rule, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                value={rule.source}
                onChange={(e) =>
                  setRule(i, { source: e.target.value as AssertionSource, path: undefined })
                }
                className="h-9 w-40"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>

              {needsPath(rule.source) && (
                <Input
                  value={rule.path ?? ''}
                  onChange={(e) => setRule(i, { path: e.target.value })}
                  placeholder={rule.source === 'json' ? 'data.status' : 'Content-Type'}
                  className="h-9 w-40"
                />
              )}

              <Select
                value={rule.op}
                onChange={(e) => setRule(i, { op: e.target.value as AssertionOp })}
                className="h-9 w-40"
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>

              {needsValue(rule.op) && (
                <Input
                  value={rule.value ?? ''}
                  onChange={(e) => setRule(i, { value: e.target.value })}
                  placeholder="value"
                  className={cn('h-9 flex-1', 'min-w-24')}
                  inputMode={
                    rule.source === 'status' || rule.source === 'response_time'
                      ? 'numeric'
                      : 'text'
                  }
                />
              )}

              <IconButton label="Remove condition" size="sm" onClick={() => removeRule(i)}>
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        leadingIcon={<Plus size={15} />}
        onClick={addRule}
      >
        Add condition
      </Button>
    </div>
  );
}

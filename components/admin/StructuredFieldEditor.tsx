'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type StructuredFieldKind = 'flow' | 'actions' | 'options' | 'branch' | 'condition' | 'factors' | 'thresholds' | 'confidence';

type Scalar = string | number | boolean | null;
type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists';
type Condition = {
  all?: Condition[];
  any?: Condition[];
  factKey?: string;
  op?: Operator;
  value?: Scalar | Scalar[];
};

type FlowNode = { questionKey: string; showIf?: { factKey: string; equals: Scalar } };
type RecommendedAction = { decisionRecommendation: string; nextSteps: string[] };
type Option = { id: string; label: string; factValue: Scalar };
type Factor = { weight: number; scale: { min: number; max: number }; mapping: Array<{ when: Condition; value: number }> };

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const OPERATORS: Operator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'exists'];
const FACTOR_KEYS = ['impact', 'likelihood', 'severity', 'controlEffectiveness', 'regulatorySensitivity', 'duration'] as const;
const CLASSIFICATIONS = ['monitor_only', 'risk', 'elevated_risk', 'issue'] as const;
const DEFAULT_LEAF: Condition = { factKey: '', op: 'eq', value: '' };
const DEFAULT_FACTOR: Factor = { weight: 0, scale: { min: 1, max: 5 }, mapping: [] };
const EDITOR_SURFACE = 'rounded-xl border border-border/80 bg-background p-4 shadow-[0_1px_2px_rgba(15,35,65,0.04)]';
const NESTED_SURFACE = 'rounded-xl border border-border/70 bg-muted/20 p-3';
const EMPTY_SURFACE = 'rounded-xl border border-dashed border-border bg-muted/10 p-4 text-xs text-muted-foreground';

function parseValue<T>(raw: string, fallback: T): T {
  if (!raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeValue(onChange: (value: string) => void, value: unknown) {
  onChange(JSON.stringify(value));
}

function scalarType(value: Scalar | undefined): 'string' | 'number' | 'boolean' | 'null' {
  if (value === null) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function convertScalar(value: string, type: ReturnType<typeof scalarType>): Scalar {
  if (type === 'null') return null;
  if (type === 'boolean') return value === 'true';
  if (type === 'number') return value.trim() === '' ? 0 : Number(value);
  return value;
}

function ScalarEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Scalar | undefined;
  onChange: (value: Scalar) => void;
}) {
  const t = useTranslations('structured.scalar');
  const type = scalarType(value);
  const typeOptions = [
    { value: 'string', label: t('text') },
    { value: 'number', label: t('number') },
    { value: 'boolean', label: t('boolean') },
    { value: 'null', label: t('null') },
  ];
  const booleanOptions = [
    { value: 'true', label: t('true') },
    { value: 'false', label: t('false') },
  ];

  function changeType(next: string | null) {
    const nextType = (next ?? 'string') as ReturnType<typeof scalarType>;
    if (nextType === 'string') onChange(value === null || value === undefined ? '' : String(value));
    else if (nextType === 'number') onChange(typeof value === 'number' ? value : 0);
    else if (nextType === 'boolean') onChange(typeof value === 'boolean' ? value : true);
    else onChange(null);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
      <div>
        <Label htmlFor={`${id}-type`}>{t('type')}</Label>
        <Select items={typeOptions} value={type} onValueChange={changeType}>
          <SelectTrigger id={`${id}-type`} className="mt-1 w-full bg-card" aria-label={t('typeFor', { label })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${id}-value`}>{label}</Label>
        {type === 'boolean' ? (
          <Select items={booleanOptions} value={String(value ?? true)} onValueChange={(next) => onChange(next === 'true')}>
            <SelectTrigger id={`${id}-value`} className="mt-1 w-full bg-card" aria-label={label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {booleanOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={`${id}-value`}
            className="mt-1 bg-card"
            type={type === 'number' ? 'number' : 'text'}
            value={value === null || value === undefined ? '' : String(value)}
            disabled={type === 'null'}
            onChange={(event) => onChange(convertScalar(event.target.value, type))}
          />
        )}
      </div>
    </div>
  );
}

function ConditionNodeEditor({
  condition,
  id,
  depth,
  onChange,
  onRemove,
}: {
  condition: Condition;
  id: string;
  depth: number;
  onChange: (condition: Condition) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('structured.condition');
  const mode = condition.all ? 'all' : condition.any ? 'any' : 'leaf';
  const groupItems = mode === 'all' ? condition.all ?? [] : mode === 'any' ? condition.any ?? [] : [];
  const op = condition.op ?? 'eq';
  const modeOptions = [
    { value: 'leaf', label: t('factComparison') },
    ...(depth < 2 ? [{ value: 'all', label: t('all') }, { value: 'any', label: t('any') }] : []),
  ];
  const operatorOptions = OPERATORS.map((operator) => ({
    value: operator,
    label: t.has(`operators.${operator}`) ? t(`operators.${operator}`) : operator,
  }));

  function changeMode(next: string | null) {
    if (next === 'all') onChange({ all: [{ ...DEFAULT_LEAF }] });
    else if (next === 'any') onChange({ any: [{ ...DEFAULT_LEAF }] });
    else onChange({ ...DEFAULT_LEAF });
  }

  function updateGroup(next: Condition[]) {
    onChange(mode === 'all' ? { all: next } : { any: next });
  }

  return (
    <div className={`${EDITOR_SURFACE} space-y-4 ${depth > 0 ? 'border-l-[3px] border-l-primary/30' : ''}`} data-testid="condition-node">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Label htmlFor={`${id}-mode`}>{t('type')}</Label>
          <Select items={modeOptions} value={mode} onValueChange={changeMode}>
            <SelectTrigger id={`${id}-mode`} className="mt-1 w-full bg-card" aria-label={t('type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {onRemove ? (
          <Button type="button" size="sm" variant="destructive" onClick={onRemove} aria-label={t('remove')}>
            {t('remove')}
          </Button>
        ) : null}
      </div>

      {mode === 'leaf' ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <div>
              <Label htmlFor={`${id}-fact`}>{t('factKey')}</Label>
              <Input
                id={`${id}-fact`}
                className="mt-1 bg-card font-mono"
                value={condition.factKey ?? ''}
                placeholder="amount_usd"
                onChange={(event) => onChange({ ...condition, factKey: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-operator`}>{t('operator')}</Label>
              <Select
                items={operatorOptions}
                value={op}
                onValueChange={(next) => {
                  const nextOp = (next ?? 'eq') as Operator;
                  const nextCondition: Condition = { factKey: condition.factKey ?? '', op: nextOp };
                  if (nextOp === 'in') nextCondition.value = Array.isArray(condition.value) ? condition.value : [''];
                  else if (nextOp !== 'exists') nextCondition.value = Array.isArray(condition.value) ? condition.value[0] ?? '' : condition.value ?? '';
                  onChange(nextCondition);
                }}
              >
                <SelectTrigger id={`${id}-operator`} className="mt-1 w-full bg-card" aria-label={t('operatorLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {op === 'exists' ? <p className="text-xs text-muted-foreground">{t('existsHelp')}</p> : null}
          {op === 'in' ? (
            <StringListEditor
              id={`${id}-values`}
              label={t('acceptedValues')}
              values={(Array.isArray(condition.value) ? condition.value : ['']).map((item) => String(item ?? ''))}
              onChange={(items) => onChange({ ...condition, value: items })}
            />
          ) : op !== 'exists' ? (
            <ScalarEditor
              id={`${id}-comparison`}
              label={t('comparisonValue')}
              value={Array.isArray(condition.value) ? condition.value[0] : condition.value}
              onChange={(value) => onChange({ ...condition, value })}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 border-l-2 border-primary/15 pl-3 sm:pl-4">
          {groupItems.map((child, index) => (
            <ConditionNodeEditor
              key={`${id}-${index}`}
              id={`${id}-${index}`}
              condition={child}
              depth={depth + 1}
              onChange={(next) => updateGroup(groupItems.map((item, itemIndex) => (itemIndex === index ? next : item)))}
              onRemove={groupItems.length > 1 ? () => updateGroup(groupItems.filter((_, itemIndex) => itemIndex !== index)) : undefined}
            />
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => updateGroup([...groupItems, { ...DEFAULT_LEAF }])}
          >
            {depth >= 2 ? t('addComparison') : t('addCondition')}
          </Button>
        </div>
      )}
    </div>
  );
}

function StringListEditor({
  id,
  label,
  values,
  onChange,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations('structured.list');
  return (
    <fieldset className={`${NESTED_SURFACE} space-y-2.5`}>
      <legend className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-[0_0_0_1px_var(--border)]">{label}</legend>
      {values.length === 0 ? <p className="text-xs text-muted-foreground">{t('empty')}</p> : null}
      {values.map((value, index) => (
        <div key={`${id}-${index}`} className="flex items-center gap-2">
          <Label className="sr-only" htmlFor={`${id}-${index}`}>
            {label} {index + 1}
          </Label>
          <Input
            id={`${id}-${index}`}
            value={value}
            onChange={(event) => onChange(values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
          />
          <Button type="button" size="sm" variant="destructive" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>
            {t('remove')}
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...values, ''])}>
        {t('add')}
      </Button>
    </fieldset>
  );
}

function FlowEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('structured.flow');
  const flow = parseValue<FlowNode[]>(value, []);
  const visibilityOptions = [
    { value: 'always', label: t('always') },
    { value: 'conditional', label: t('conditional') },
  ];

  function update(next: FlowNode[]) {
    writeValue(onChange, next);
  }

  return (
    <div className="space-y-3" data-testid="structured-flow">
      {flow.length === 0 ? <p className={EMPTY_SURFACE}>{t('empty')}</p> : null}
      {flow.map((node, index) => (
        <fieldset key={`flow-${index}`} className={`${EDITOR_SURFACE} space-y-4`}>
          <legend className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t('question', { number: index + 1 })}</legend>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Label htmlFor={`flow-${index}-question`}>{t('questionKey')}</Label>
              <Input
                id={`flow-${index}-question`}
                className="mt-1 bg-card font-mono"
                value={node.questionKey}
                onChange={(event) => update(flow.map((item, itemIndex) => (itemIndex === index ? { ...item, questionKey: event.target.value } : item)))}
              />
            </div>
            <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => update(moveItem(flow, index, index - 1))}>
              {t('moveUp')}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={index === flow.length - 1} onClick={() => update(moveItem(flow, index, index + 1))}>
              {t('moveDown')}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => update(flow.filter((_, itemIndex) => itemIndex !== index))}>
              {t('remove')}
            </Button>
          </div>
          <div>
            <Label htmlFor={`flow-${index}-visibility`}>{t('visibility')}</Label>
            <Select
              items={visibilityOptions}
              value={node.showIf ? 'conditional' : 'always'}
              onValueChange={(next) => {
                const showIf = next === 'conditional' ? node.showIf ?? { factKey: '', equals: '' } : undefined;
                update(flow.map((item, itemIndex) => (itemIndex === index ? { questionKey: item.questionKey, ...(showIf ? { showIf } : {}) } : item)));
              }}
            >
              <SelectTrigger id={`flow-${index}-visibility`} className="mt-1 w-full bg-card" aria-label={t('visibilityFor', { number: index + 1 })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibilityOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {node.showIf ? (
            <div className={`${NESTED_SURFACE} space-y-3`}>
              <Label htmlFor={`flow-${index}-fact`}>{t('factKey')}</Label>
              <Input
                id={`flow-${index}-fact`}
                className="bg-card font-mono"
                value={node.showIf.factKey}
                onChange={(event) =>
                  update(flow.map((item, itemIndex) => (itemIndex === index ? { ...item, showIf: { ...node.showIf!, factKey: event.target.value } } : item)))
                }
              />
              <ScalarEditor
                id={`flow-${index}-equals`}
                label={t('mustEqual')}
                value={node.showIf.equals}
                onChange={(equals) => update(flow.map((item, itemIndex) => (itemIndex === index ? { ...item, showIf: { ...node.showIf!, equals } } : item)))}
              />
            </div>
          ) : null}
        </fieldset>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => update([...flow, { questionKey: '' }])}>
        {t('addQuestion')}
      </Button>
    </div>
  );
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function ActionsEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('structured.actions');
  const actions = parseValue<Partial<Record<(typeof CLASSIFICATIONS)[number], RecommendedAction>>>(value, {});

  function update(next: typeof actions) {
    writeValue(onChange, next);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="structured-actions">
      {CLASSIFICATIONS.map((classification) => {
        const action = actions[classification];
        return (
          <fieldset key={classification} className={`${EDITOR_SURFACE} space-y-3`}>
            <legend className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t(`classification.${classification}`)}</legend>
            {action ? (
              <>
                <Label htmlFor={`action-${classification}-decision`}>{t('recommendation')}</Label>
                <Input
                  id={`action-${classification}-decision`}
                  value={action.decisionRecommendation}
                  onChange={(event) => update({ ...actions, [classification]: { ...action, decisionRecommendation: event.target.value } })}
                />
                <StringListEditor
                  id={`action-${classification}-steps`}
                  label={t('nextSteps')}
                  values={action.nextSteps ?? []}
                  onChange={(nextSteps) => update({ ...actions, [classification]: { ...action, nextSteps } })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    const next = { ...actions };
                    delete next[classification];
                    update(next);
                  }}
                >
                  {t('remove', { classification: t(`classification.${classification}`) })}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => update({ ...actions, [classification]: { decisionRecommendation: '', nextSteps: [] } })}
              >
                {t('configure')}
              </Button>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function OptionsEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('structured.options');
  const options = parseValue<Option[]>(value, []);

  function update(next: Option[]) {
    writeValue(onChange, next);
  }

  return (
    <div className="space-y-3" data-testid="structured-options">
      {options.length === 0 ? <p className={EMPTY_SURFACE}>{t('empty')}</p> : null}
      {options.map((option, index) => (
        <fieldset key={`option-${index}`} className={`${EDITOR_SURFACE} space-y-4`}>
          <legend className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t('choice', { number: index + 1 })}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`option-${index}-id`}>{t('id')}</Label>
              <Input
                id={`option-${index}-id`}
                className="mt-1 bg-card font-mono"
                value={option.id}
                onChange={(event) => update(options.map((item, itemIndex) => (itemIndex === index ? { ...item, id: event.target.value } : item)))}
              />
            </div>
            <div>
              <Label htmlFor={`option-${index}-label`}>{t('label')}</Label>
              <Input
                id={`option-${index}-label`}
                className="mt-1 bg-card"
                value={option.label}
                onChange={(event) => update(options.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))}
              />
            </div>
          </div>
          <ScalarEditor
            id={`option-${index}-fact-value`}
            label={t('factValue')}
            value={option.factValue}
            onChange={(factValue) => update(options.map((item, itemIndex) => (itemIndex === index ? { ...item, factValue } : item)))}
          />
          <Button type="button" size="sm" variant="destructive" onClick={() => update(options.filter((_, itemIndex) => itemIndex !== index))}>
            {t('remove')}
          </Button>
        </fieldset>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => update([...options, { id: '', label: '', factValue: '' }])}>
        {t('add')}
      </Button>
    </div>
  );
}

function BranchEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('structured.branch');
  const branch = parseValue<{ onValue: Scalar; questionKeys: string[] } | null>(value, null);

  if (!branch) {
    return (
      <div className={EMPTY_SURFACE} data-testid="structured-branch">
        <p className="mb-2 text-xs text-muted-foreground">{t('empty')}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => writeValue(onChange, { onValue: true, questionKeys: [''] })}>
          {t('add')}
        </Button>
      </div>
    );
  }

  return (
    <div className={`${EDITOR_SURFACE} space-y-4`} data-testid="structured-branch">
      <ScalarEditor id="branch-on-value" label={t('answer')} value={branch.onValue} onChange={(onValue) => writeValue(onChange, { ...branch, onValue })} />
      <StringListEditor
        id="branch-question-keys"
        label={t('questionKeys')}
        values={branch.questionKeys}
        onChange={(questionKeys) => writeValue(onChange, { ...branch, questionKeys })}
      />
      <p className="text-xs text-muted-foreground">{t('help')}</p>
    </div>
  );
}

function ConditionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const condition = parseValue<Condition>(value, { ...DEFAULT_LEAF });
  return (
    <div data-testid="structured-condition">
      <ConditionNodeEditor condition={condition} id="rule-condition" depth={0} onChange={(next) => writeValue(onChange, next)} />
    </div>
  );
}

function FactorsEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('structured.factors');
  const factors = parseValue<Record<string, Factor>>(value, {});
  const totalWeight = FACTOR_KEYS.reduce((sum, key) => sum + Number(factors[key]?.weight ?? 0), 0);

  function updateFactor(key: (typeof FACTOR_KEYS)[number], factor: Factor) {
    writeValue(onChange, { ...factors, [key]: factor });
  }

  return (
    <div className="space-y-3" data-testid="structured-factors">
      <p className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${totalWeight === 100 ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/5 text-destructive'}`} role="status">
        {t('totalWeight', { total: totalWeight })} {totalWeight === 100 ? t('valid') : t('invalidTotal')}
      </p>
      {FACTOR_KEYS.map((key) => {
        const factor = factors[key] ?? DEFAULT_FACTOR;
        return (
          <fieldset key={key} className={`${EDITOR_SURFACE} space-y-4`}>
            <legend className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary">{t(`names.${key}`)}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor={`factor-${key}-weight`}>{t('weight')}</Label>
                <Input
                  id={`factor-${key}-weight`}
                  className="mt-1 bg-card"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={factor.weight}
                  onChange={(event) => event.target.value !== '' && updateFactor(key, { ...factor, weight: Number(event.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor={`factor-${key}-min`}>{t('scaleMin')}</Label>
                <Input
                  id={`factor-${key}-min`}
                  className="mt-1 bg-card"
                  type="number"
                  value={factor.scale.min}
                  onChange={(event) => event.target.value !== '' && updateFactor(key, { ...factor, scale: { ...factor.scale, min: Number(event.target.value) } })}
                />
              </div>
              <div>
                <Label htmlFor={`factor-${key}-max`}>{t('scaleMax')}</Label>
                <Input
                  id={`factor-${key}-max`}
                  className="mt-1 bg-card"
                  type="number"
                  value={factor.scale.max}
                  onChange={(event) => event.target.value !== '' && updateFactor(key, { ...factor, scale: { ...factor.scale, max: Number(event.target.value) } })}
                />
              </div>
            </div>
            <div className={`${NESTED_SURFACE} space-y-3`}>
              <p className="text-xs font-medium">{t('mappings')}</p>
              {factor.mapping.length === 0 ? <p className="text-xs text-muted-foreground">{t('emptyMappings')}</p> : null}
              {factor.mapping.map((mapping, index) => (
                <div key={`mapping-${key}-${index}`} className="space-y-3 rounded-xl border bg-background p-3 shadow-[0_1px_2px_rgba(15,35,65,0.04)]">
                  <p className="text-xs font-medium">{t('mapping', { number: index + 1 })}</p>
                  <ConditionNodeEditor
                    condition={mapping.when}
                    id={`factor-${key}-mapping-${index}`}
                    depth={0}
                    onChange={(when) =>
                      updateFactor(key, { ...factor, mapping: factor.mapping.map((item, itemIndex) => (itemIndex === index ? { ...item, when } : item)) })
                    }
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-40 flex-1">
                      <Label htmlFor={`factor-${key}-mapping-${index}-value`}>{t('factorValue')}</Label>
                      <Input
                        id={`factor-${key}-mapping-${index}-value`}
                        className="mt-1 bg-card"
                        type="number"
                        min={factor.scale.min}
                        max={factor.scale.max}
                        value={mapping.value}
                        onChange={(event) =>
                          event.target.value !== '' &&
                          updateFactor(key, {
                            ...factor,
                            mapping: factor.mapping.map((item, itemIndex) => (itemIndex === index ? { ...item, value: Number(event.target.value) } : item)),
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => updateFactor(key, { ...factor, mapping: factor.mapping.filter((_, itemIndex) => itemIndex !== index) })}
                    >
                      {t('removeMapping')}
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => updateFactor(key, { ...factor, mapping: [...factor.mapping, { when: { ...DEFAULT_LEAF }, value: factor.scale.min }] })}
              >
                {t('addMapping')}
              </Button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function ThresholdsEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('structured.thresholds');
  const thresholds = parseValue<Record<string, { min: number; max: number }>>(value, {});

  function update(classification: (typeof CLASSIFICATIONS)[number], range: { min: number; max: number }) {
    writeValue(onChange, { ...thresholds, [classification]: range });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="structured-thresholds">
      {CLASSIFICATIONS.map((classification) => {
        const range = thresholds[classification] ?? { min: 0, max: 0 };
        return (
          <fieldset key={classification} className={`${EDITOR_SURFACE} p-4`}>
            <legend className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{t(`classification.${classification}`)}</legend>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`threshold-${classification}-min`}>{t('minimum')}</Label>
                <Input
                  id={`threshold-${classification}-min`}
                  className="mt-1 bg-card"
                  type="number"
                  min={0}
                  max={100}
                  value={range.min}
                  onChange={(event) => event.target.value !== '' && update(classification, { ...range, min: Number(event.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor={`threshold-${classification}-max`}>{t('maximum')}</Label>
                <Input
                  id={`threshold-${classification}-max`}
                  className="mt-1 bg-card"
                  type="number"
                  min={0}
                  max={100}
                  value={range.max}
                  onChange={(event) => event.target.value !== '' && update(classification, { ...range, max: Number(event.target.value) })}
                />
              </div>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function ConfidenceEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('structured.confidence');
  const confidence = parseValue<{ professionalConsultBelow: number; mandatoryReviewBelow: number }>(value, {
    professionalConsultBelow: 60,
    mandatoryReviewBelow: 40,
  });

  return (
    <div className={`${EDITOR_SURFACE} grid gap-3 sm:grid-cols-2`} data-testid="structured-confidence">
      <div>
        <Label htmlFor="confidence-consult">{t('consult')}</Label>
        <Input
          id="confidence-consult"
          className="mt-1 bg-card"
          type="number"
          min={0}
          max={100}
          value={confidence.professionalConsultBelow}
          onChange={(event) => event.target.value !== '' && writeValue(onChange, { ...confidence, professionalConsultBelow: Number(event.target.value) })}
        />
      </div>
      <div>
        <Label htmlFor="confidence-review">{t('review')}</Label>
        <Input
          id="confidence-review"
          className="mt-1 bg-card"
          type="number"
          min={0}
          max={100}
          value={confidence.mandatoryReviewBelow}
          onChange={(event) => event.target.value !== '' && writeValue(onChange, { ...confidence, mandatoryReviewBelow: Number(event.target.value) })}
        />
      </div>
    </div>
  );
}

export function StructuredFieldEditor({
  kind,
  value,
  onChange,
}: {
  kind: StructuredFieldKind;
  value: string;
  onChange: (value: string) => void;
}) {
  if (kind === 'flow') return <FlowEditor value={value} onChange={onChange} />;
  if (kind === 'actions') return <ActionsEditor value={value} onChange={onChange} />;
  if (kind === 'options') return <OptionsEditor value={value} onChange={onChange} />;
  if (kind === 'branch') return <BranchEditor value={value} onChange={onChange} />;
  if (kind === 'condition') return <ConditionEditor value={value} onChange={onChange} />;
  if (kind === 'factors') return <FactorsEditor value={value} onChange={onChange} />;
  if (kind === 'thresholds') return <ThresholdsEditor value={value} onChange={onChange} />;
  return <ConfidenceEditor value={value} onChange={onChange} />;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type ValidationMessage = (key: string, values?: Record<string, string | number>) => string;

function validateKey(value: unknown, path: string, errors: string[], message: ValidationMessage) {
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) errors.push(message('keyFormat', { path }));
}

function validateScalar(value: unknown, path: string, errors: string[], message: ValidationMessage) {
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) errors.push(message('scalar', { path }));
  if (typeof value === 'number' && !Number.isFinite(value)) errors.push(message('finite', { path }));
}

function validateCondition(value: unknown, path: string, errors: string[], message: ValidationMessage, depth = 0) {
  if (!isRecord(value)) {
    errors.push(message('condition.invalid', { path }));
    return;
  }
  const groups = ['all', 'any'].filter((key) => Array.isArray(value[key]));
  if (groups.length > 0) {
    if (groups.length !== 1 || value.factKey !== undefined || value.op !== undefined) errors.push(message('condition.exclusive', { path }));
    const children = value[groups[0]!] as unknown[];
    if (children.length === 0) errors.push(message('condition.groupEmpty', { path }));
    if (depth >= 2) errors.push(message('condition.depth', { path }));
    children.forEach((child, index) =>
      validateCondition(child, message('paths.condition', { path, number: index + 1 }), errors, message, depth + 1),
    );
    return;
  }
  validateKey(value.factKey, message('paths.factKey', { path }), errors, message);
  if (typeof value.op !== 'string' || !OPERATORS.includes(value.op as Operator)) errors.push(message('condition.operator', { path }));
  if (value.op === 'in') {
    if (!Array.isArray(value.value) || value.value.length === 0) errors.push(message('condition.inValue', { path }));
    else value.value.forEach((entry, index) => validateScalar(entry, message('paths.acceptedValue', { path, number: index + 1 }), errors, message));
  } else if (value.op !== 'exists') {
    if (value.value === undefined || Array.isArray(value.value)) errors.push(message('condition.comparison', { path }));
    else validateScalar(value.value, message('paths.comparisonValue', { path }), errors, message);
  }
}

export function validateStructuredField(
  kind: StructuredFieldKind,
  value: unknown,
  formValues: Record<string, string>,
  message: ValidationMessage,
): string[] {
  const errors: string[] = [];

  if (kind === 'flow') {
    if (!Array.isArray(value)) return [message('flow.list')];
    const seen = new Set<string>();
    value.forEach((entry, index) => {
      const question = message('paths.question', { number: index + 1 });
      if (!isRecord(entry)) {
        errors.push(message('flow.questionInvalid', { question }));
        return;
      }
      validateKey(entry.questionKey, message('paths.questionKey', { question }), errors, message);
      if (typeof entry.questionKey === 'string' && seen.has(entry.questionKey)) errors.push(message('flow.duplicate', { question, key: entry.questionKey }));
      if (typeof entry.questionKey === 'string') seen.add(entry.questionKey);
      if (entry.showIf !== undefined) {
        if (!isRecord(entry.showIf)) errors.push(message('flow.visibilityInvalid', { question }));
        else {
          validateKey(entry.showIf.factKey, message('paths.visibilityFact', { question }), errors, message);
          validateScalar(entry.showIf.equals, message('paths.visibilityValue', { question }), errors, message);
        }
      }
    });
  } else if (kind === 'actions') {
    if (!isRecord(value)) return [message('actions.object')];
    CLASSIFICATIONS.forEach((classification) => {
      const action = value[classification];
      const label = message(`classification.${classification}`);
      if (action === undefined) return;
      if (!isRecord(action)) {
        errors.push(message('actions.invalid', { classification: label }));
        return;
      }
      if (typeof action.decisionRecommendation !== 'string' || action.decisionRecommendation.trim().length < 2) {
        errors.push(message('actions.recommendation', { classification: label }));
      }
      if (!Array.isArray(action.nextSteps) || action.nextSteps.some((step) => typeof step !== 'string' || !step.trim())) {
        errors.push(message('actions.steps', { classification: label }));
      }
    });
  } else if (kind === 'options') {
    if (!Array.isArray(value)) return [message('options.list')];
    const questionType = formValues.type;
    if (questionType === 'mcq' && value.length < 2) errors.push(message('options.mcqMinimum'));
    if (questionType && questionType !== 'mcq' && value.length > 0) errors.push(message('options.mcqOnly'));
    value.forEach((entry, index) => {
      const choice = message('paths.choice', { number: index + 1 });
      if (!isRecord(entry)) {
        errors.push(message('options.invalid', { choice }));
        return;
      }
      if (typeof entry.id !== 'string' || !entry.id.trim()) errors.push(message('options.id', { choice }));
      if (typeof entry.label !== 'string' || !entry.label.trim()) errors.push(message('options.label', { choice }));
      validateScalar(entry.factValue, message('paths.storedValue', { choice }), errors, message);
    });
  } else if (kind === 'branch') {
    if (!isRecord(value)) return [message('branch.invalid')];
    validateScalar(value.onValue, message('paths.branchAnswer'), errors, message);
    if (!Array.isArray(value.questionKeys) || value.questionKeys.length === 0) errors.push(message('branch.minimum'));
    else value.questionKeys.forEach((questionKey, index) => validateKey(questionKey, message('paths.followUp', { number: index + 1 }), errors, message));
  } else if (kind === 'condition') {
    validateCondition(value, message('paths.trigger'), errors, message);
  } else if (kind === 'factors') {
    if (!isRecord(value)) return [message('factors.invalid')];
    let total = 0;
    FACTOR_KEYS.forEach((key) => {
      const factor = value[key];
      const factorName = message(`factors.names.${key}`);
      if (!isRecord(factor)) {
        errors.push(message('factors.missing', { factor: factorName }));
        return;
      }
      const weight = Number(factor.weight);
      total += weight;
      if (!Number.isFinite(weight) || weight < 0 || weight > 100) errors.push(message('factors.weight', { factor: factorName }));
      if (!isRecord(factor.scale)) errors.push(message('factors.scale', { factor: factorName }));
      else {
        const min = Number(factor.scale.min);
        const max = Number(factor.scale.max);
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) errors.push(message('factors.scaleOrder', { factor: factorName }));
        if (!Array.isArray(factor.mapping)) errors.push(message('factors.mappings', { factor: factorName }));
        else {
          factor.mapping.forEach((mapping, index) => {
            const mappingName = message('paths.mapping', { factor: factorName, number: index + 1 });
            if (!isRecord(mapping)) {
              errors.push(message('factors.mappingInvalid', { mapping: mappingName }));
              return;
            }
            validateCondition(mapping.when, mappingName, errors, message);
            const mappedValue = Number(mapping.value);
            if (!Number.isFinite(mappedValue) || mappedValue < min || mappedValue > max) {
              errors.push(message('factors.mappingValue', { mapping: mappingName, min, max }));
            }
          });
        }
      }
    });
    if (Math.round(total * 100) / 100 !== 100) errors.push(message('factors.total', { total }));
  } else if (kind === 'thresholds') {
    if (!isRecord(value)) return [message('thresholds.invalid')];
    let expectedMin = 0;
    CLASSIFICATIONS.forEach((classification) => {
      const range = value[classification];
      const label = message(`classification.${classification}`);
      if (!isRecord(range)) {
        errors.push(message('thresholds.missing', { classification: label }));
        return;
      }
      const min = Number(range.min);
      const max = Number(range.max);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 100 || max < min) {
        errors.push(message('thresholds.range', { classification: label }));
      }
      if (min !== expectedMin) errors.push(message('thresholds.start', { classification: label, minimum: expectedMin }));
      expectedMin = max + 1;
    });
    if ((value.issue as Record<string, unknown> | undefined)?.max !== 100) errors.push(message('thresholds.end'));
  } else {
    if (!isRecord(value)) return [message('confidence.invalid')];
    const consult = Number(value.professionalConsultBelow);
    const review = Number(value.mandatoryReviewBelow);
    if (!Number.isFinite(consult) || consult < 0 || consult > 100) errors.push(message('confidence.consult'));
    if (!Number.isFinite(review) || review < 0 || review > 100) errors.push(message('confidence.review'));
    if (review > consult) errors.push(message('confidence.order'));
  }

  return errors;
}

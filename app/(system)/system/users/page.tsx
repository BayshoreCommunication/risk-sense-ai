'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, Ellipsis, UserPlus, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shell/PageHeader';
import { useWorkspace } from '@/components/shell/workspace-context';
import { api, toApiError } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/types';
import { formatIdentifierLabel } from '@/lib/format-identifier-label';
import { isPublicDemoAccessMode, isReservedPublicDemoEmail } from '@/lib/public-demo';

type SystemUser = components['schemas']['SystemUser'];
type Department = components['schemas']['SystemDepartment'];
type UserCreate = NonNullable<paths['/system/users']['post']['requestBody']>['content']['application/json'];
type UserPatch = NonNullable<paths['/system/users/{id}']['patch']['requestBody']>['content']['application/json'];
type Role = SystemUser['role'];
type PlanState = 'loading' | 'ready' | 'error';

type UserDraft = {
  email: string;
  name: string;
  role: Role;
  departmentIds: string[];
  crossDepartmentAccess: boolean;
  status: SystemUser['status'];
};
type Editor = { mode: 'create'; user: null } | { mode: 'edit'; user: SystemUser };

const ROLES: Role[] = ['requestor', 'administrator', 'system_administrator', 'audit'];
const ROLE_BADGE_CLASS: Record<Role, string> = {
  requestor: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300',
  administrator: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300',
  system_administrator: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
  audit: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
};
const AVATAR_CLASS: Record<Role, string> = {
  requestor: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300',
  administrator: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
  system_administrator: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
  audit: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
};

const EMPTY_USER: UserDraft = {
  email: '',
  name: '',
  role: 'requestor',
  departmentIds: [],
  crossDepartmentAccess: false,
  status: 'active',
};

function errorMessage(result: { error?: unknown }) {
  return toApiError(result.error).message;
}

function sortUsers(users: SystemUser[]) {
  return [...users].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

function userInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** Tenant-scoped provisioning and exactly-one-role administration (FR-02, FR-10, SEC-02). */
export default function UsersPage() {
  const locale = useLocale();
  const t = useTranslations('system.users');
  const workspace = useWorkspace();
  const isPublicDemo = isPublicDemoAccessMode(workspace?.accessMode);
  const roles = useTranslations('roles');
  const status = useTranslations('status');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_USER);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmAccessChange, setConfirmAccessChange] = useState(false);
  const [plan, setPlan] = useState<'free' | 'paid' | null>(null);
  const [planState, setPlanState] = useState<PlanState>('loading');
  const [otpRequired, setOtpRequired] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    setPlan(null);
    setPlanState('loading');
    setOtpRequired(null);
    const [usersResult, departmentsResult, tenantResult] = await Promise.all([api.GET('/system/users'), api.GET('/system/departments'), api.GET('/system/tenant')]);
    setLoading(false);
    const errors: string[] = [];
    if (usersResult.data) setUsers(sortUsers(usersResult.data.data));
    else errors.push(errorMessage(usersResult as { error?: unknown }));
    if (departmentsResult.data) setDepartments(departmentsResult.data.data);
    else errors.push(errorMessage(departmentsResult as { error?: unknown }));
    if (tenantResult.data) {
      setPlan(tenantResult.data.data.plan);
      setOtpRequired(tenantResult.data.data.authPolicy.otpRequired);
      setPlanState('ready');
    } else {
      errors.push(errorMessage(tenantResult as { error?: unknown }));
      setPlanState('error');
    }
    setPageError(errors.length > 0 ? [...new Set(errors)].join(' ') : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentNames = useMemo(() => new Map(departments.map((department) => [department._id, department.name])), [departments]);
  const requiresRecordedMfa = (user: SystemUser) =>
    user.role === 'administrator' ||
    user.role === 'system_administrator' ||
    (plan === 'paid' && user.role === 'audit') ||
    (otpRequired === true && !(plan === 'paid' && user.role === 'requestor'));
  const availableRoles: Role[] =
    plan === 'paid'
      ? ROLES
      : plan === 'free' && draft.role !== 'requestor'
        ? [draft.role, 'requestor']
        : ['requestor'];
  const roleOptions = availableRoles.map((role) => ({ value: role, label: roles(role) }));
  const statusOptions = [
    { value: 'active', label: status('active') },
    { value: 'disabled', label: status('disabled') },
  ];
  const controlsDisabled = planState !== 'ready' || pageError !== null;

  function updateDraft(next: Partial<UserDraft>) {
    setDraft((current) => ({ ...current, ...next }));
    setFormError(null);
    setConfirmAccessChange(false);
  }

  function openCreate() {
    if (controlsDisabled) return;
    setEditor({ mode: 'create', user: null });
    setDraft(EMPTY_USER);
    setFormError(null);
    setConfirmAccessChange(false);
  }

  function openEdit(user: SystemUser) {
    if (controlsDisabled) return;
    setEditor({ mode: 'edit', user });
    setDraft({
      email: user.email,
      name: user.name,
      role: user.role,
      departmentIds: user.departmentIds,
      crossDepartmentAccess: user.crossDepartmentAccess,
      status: user.status,
    });
    setFormError(null);
    setConfirmAccessChange(false);
  }

  function closeEditor() {
    if (saving) return;
    setEditor(null);
    setConfirmAccessChange(false);
  }

  function toggleDepartment(departmentId: string, checked: boolean) {
    updateDraft({
      departmentIds: checked ? [...new Set([...draft.departmentIds, departmentId])] : draft.departmentIds.filter((id) => id !== departmentId),
    });
  }

  function buildPatch(user: SystemUser): UserPatch {
    const patch: UserPatch = {};
    if (draft.name.trim() !== user.name) patch.name = draft.name.trim();
    if (draft.role !== user.role) patch.role = draft.role;
    if (draft.status !== user.status) patch.status = draft.status;
    if (draft.crossDepartmentAccess !== user.crossDepartmentAccess) patch.crossDepartmentAccess = draft.crossDepartmentAccess;
    if ([...draft.departmentIds].sort().join(',') !== [...user.departmentIds].sort().join(',')) patch.departmentIds = draft.departmentIds;
    return patch;
  }

  async function save() {
    if (!editor) return;
    setFormError(null);
    if (draft.name.trim().length < 2) {
      setFormError(t('validation.name'));
      return;
    }
    if (editor.mode === 'create' && !draft.email.trim()) {
      setFormError(t('validation.email'));
      return;
    }
    if (editor.mode === 'create' && isPublicDemo && !isReservedPublicDemoEmail(draft.email)) {
      setFormError(t('validation.demoEmail'));
      return;
    }

    let body: UserCreate | UserPatch;
    if (editor.mode === 'create') {
      body = {
        email: draft.email.trim().toLowerCase(),
        name: draft.name.trim(),
        role: draft.role,
        departmentIds: draft.role === 'requestor' ? draft.departmentIds : [],
        crossDepartmentAccess: draft.role === 'requestor' && draft.crossDepartmentAccess,
      };
    } else {
      body = buildPatch(editor.user);
      if (Object.keys(body).length === 0) {
        setFormError(t('validation.noChanges'));
        return;
      }
      const changesAccess = body.role !== undefined || body.status !== undefined;
      if (changesAccess && !confirmAccessChange) {
        setConfirmAccessChange(true);
        return;
      }
    }

    setSaving(true);
    const result =
      editor.mode === 'create'
        ? await api.POST('/system/users', { body: body as UserCreate })
        : await api.PATCH('/system/users/{id}', { params: { path: { id: editor.user._id } }, body: body as UserPatch });
    setSaving(false);
    if (!result.data) {
      setFormError(errorMessage(result as { error?: unknown }));
      return;
    }
    const savedUser = result.data.data;
    setUsers((current) => sortUsers(editor.mode === 'create' ? [...current, savedUser] : current.map((user) => (user._id === savedUser._id ? savedUser : user))));
    setEditor(null);
    setConfirmAccessChange(false);
  }

  return (
    <div className="page-shell max-w-7xl">
      <PageHeader
        title={t('title')}
        description={t('description')}
        requirements={['FR-02', 'FR-10']}
      />

      {pageError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3" role="alert">
          <p className="text-sm text-destructive">{pageError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-[0_10px_30px_rgba(15,35,65,0.06)]" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="card-icon"><UsersRound className="size-5" aria-hidden="true" /></span>
            <div>
              <h2 className="font-heading text-base font-bold tracking-[-0.01em]">{t('list.title')}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('list.description')}</p>
            </div>
          </div>
          <Button variant="outline" onClick={openCreate} disabled={controlsDisabled}><UserPlus aria-hidden="true" />{t('provision')}</Button>
        </div>

        <div className="hidden lg:block">
          <Table className="min-w-[840px] table-fixed" containerLabel={t('list.title')}>
            <TableHeader className="bg-muted/35">
              <TableRow>
                <TableHead className="w-[28%]">{t('columns.user')}</TableHead>
                <TableHead className="w-[18%]">{t('columns.role')}</TableHead>
                <TableHead className="w-[22%]">{t('columns.departments')}</TableHead>
                <TableHead className="w-[16%]">{t('columns.mfa')}</TableHead>
                <TableHead className="w-[12%]">{t('columns.status')}</TableHead>
                <TableHead className="w-[4%]"><span className="sr-only">{t('columns.action')}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{t('loading')}</TableCell>
                </TableRow>
              )}
              {!loading && !pageError && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{t('empty')}</TableCell>
                </TableRow>
              )}
              {users.map((user) => (
                <TableRow key={user._id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold ${AVATAR_CLASS[user.role]}`} aria-hidden="true">{userInitials(user.name)}</span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{user.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={ROLE_BADGE_CLASS[user.role]}>{roles.has(user.role) ? roles(user.role) : formatIdentifierLabel(user.role)}</Badge></TableCell>
                  <TableCell className="whitespace-normal">
                    {user.role !== 'requestor'
                      ? t('scope.notApplicable')
                      : user.crossDepartmentAccess
                        ? t('scope.allDepartments')
                        : user.departmentIds.map((id) => departmentNames.get(id) ?? id).join(', ') || t('scope.ownOnly')}
                  </TableCell>
                  <TableCell><Badge variant={user.mfaEnrolled ? 'outline' : planState !== 'ready' ? 'secondary' : plan === 'paid' && user.role === 'requestor' ? 'secondary' : requiresRecordedMfa(user) ? 'destructive' : 'secondary'}>{user.mfaEnrolled ? t('mfa.enrolled') : planState !== 'ready' ? t('mfa.unavailable') : plan === 'paid' && user.role === 'requestor' ? t('mfa.signIn') : requiresRecordedMfa(user) ? t('mfa.pending') : t('mfa.notRequired')}</Badge></TableCell>
                  <TableCell><Badge variant={user.status === 'active' ? 'outline' : 'destructive'} className={user.status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300' : undefined}>{status.has(user.status) ? status(user.status) : formatIdentifierLabel(user.status)}</Badge></TableCell>
                  <TableCell className="text-right"><Button size="icon-xs" variant="ghost" aria-label={t('edit')} title={t('edit')} onClick={() => openEdit(user)} disabled={controlsDisabled}><Ellipsis aria-hidden="true" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="divide-y lg:hidden">
          {loading && <p className="p-8 text-center text-sm text-muted-foreground">{t('loading')}</p>}
          {!loading && !pageError && users.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('empty')}</p>}
          {users.map((user) => (
            <article key={user._id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold ${AVATAR_CLASS[user.role]}`} aria-hidden="true">{userInitials(user.name)}</span>
                  <div className="min-w-0"><h2 className="truncate font-semibold">{user.name}</h2><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
                </div>
                <Badge variant={user.status === 'active' ? 'outline' : 'destructive'} className={user.status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300' : undefined}>{status.has(user.status) ? status(user.status) : formatIdentifierLabel(user.status)}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><dt className="text-muted-foreground">{t('columns.role')}</dt><dd className="mt-1"><Badge variant="outline" className={ROLE_BADGE_CLASS[user.role]}>{roles.has(user.role) ? roles(user.role) : formatIdentifierLabel(user.role)}</Badge></dd></div>
                <div><dt className="text-muted-foreground">{t('columns.mfa')}</dt><dd className="mt-0.5 font-medium">{user.mfaEnrolled ? t('mfa.enrolled') : planState !== 'ready' ? t('mfa.unavailable') : plan === 'paid' && user.role === 'requestor' ? t('mfa.signIn') : requiresRecordedMfa(user) ? t('mfa.pending') : t('mfa.notRequired')}</dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.departments')}</dt><dd className="mt-0.5 font-medium">{user.role !== 'requestor' ? t('scope.notApplicable') : user.crossDepartmentAccess ? t('scope.allDepartments') : user.departmentIds.map((id) => departmentNames.get(id) ?? id).join(', ') || t('scope.ownOnly')}</dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.lastLogin')}</dt><dd className="mt-0.5 font-medium">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(locale) : t('never')}</dd></div>
              </dl>
              <Button className="w-full" size="sm" variant="outline" onClick={() => openEdit(user)} disabled={controlsDisabled}>{t('edit')}</Button>
            </article>
          ))}
        </div>

        {/* The frame closes with one policy line; later client comments require every PAID account to complete MFA. */}
        <div id="user-role-policy" className="m-4 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/55 p-4 text-sm leading-6 text-blue-950/80 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-100/85 sm:m-6">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-blue-800 dark:text-blue-300" aria-hidden="true" />
          <p>
            {planState === 'loading' ? t('accessPolicy.loading') : planState === 'error' ? t('accessPolicy.error') : plan === 'free' ? t('accessPolicy.free') : t('accessPolicy.paid')}{' '}
            {planState === 'loading' ? t('accessPolicy.mfaLoading') : planState === 'error' ? t('accessPolicy.mfaError') : plan === 'paid' ? t('accessPolicy.paidMfa') : t('accessPolicy.freeMfa')}
          </p>
        </div>
      </section>

      <Dialog open={editor !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editor?.mode === 'edit' ? t('dialog.editTitle', { name: editor.user.name }) : t('dialog.createTitle')}</DialogTitle>
            <DialogDescription>
              {editor?.mode === 'edit'
                ? t('dialog.editDescription')
                : t('dialog.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="user-name">{t('fields.name')}</Label>
                <Input id="user-name" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} required minLength={2} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="user-email">{t('fields.email')}</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => updateDraft({ email: event.target.value })}
                  required
                  disabled={editor?.mode === 'edit'}
                  placeholder={isPublicDemo && editor?.mode === 'create' ? 'name@demo.invalid' : undefined}
                  aria-describedby={isPublicDemo && editor?.mode === 'create' ? 'demo-user-email-help' : undefined}
                />
                {isPublicDemo && editor?.mode === 'create' ? (
                  <p id="demo-user-email-help" className="text-xs leading-5 text-muted-foreground">{t('fields.demoEmailHint')}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="user-role">{t('fields.role')}</Label>
                <Select items={roleOptions} disabled={planState !== 'ready'} value={draft.role} onValueChange={(value) => {
                    const role = (value ?? 'requestor') as Role;
                    updateDraft({ role, ...(role === 'requestor' ? {} : { departmentIds: [], crossDepartmentAccess: false }) });
                  }}>
                  <SelectTrigger id="user-role" className="w-full" aria-describedby="user-role-policy"><SelectValue /></SelectTrigger>
                  <SelectContent>{roleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {editor?.mode === 'edit' && (
                <div className="space-y-1">
                  <Label htmlFor="user-status">{t('fields.status')}</Label>
                  <Select items={statusOptions} value={draft.status} onValueChange={(value) => updateDraft({ status: (value ?? 'active') as SystemUser['status'] })}>
                    <SelectTrigger id="user-status" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{statusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {draft.role === 'requestor' && (
              <fieldset className="space-y-2 rounded-xl border bg-muted/20 p-3">
                <legend className="px-1 text-sm font-medium">{t('departmentScope.title')}</legend>
                {departments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('departmentScope.empty')}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {departments.map((department) => (
                      <label key={department._id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={draft.departmentIds.includes(department._id)} onChange={(event) => toggleDepartment(department._id, event.target.checked)} />
                        {department.name}
                      </label>
                    ))}
                  </div>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <input className="mt-0.5" type="checkbox" checked={draft.crossDepartmentAccess} onChange={(event) => updateDraft({ crossDepartmentAccess: event.target.checked })} />
                  <span>{t('departmentScope.crossDepartment')}</span>
                </label>
              </fieldset>
            )}

            {formError && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{formError}</p>}
            {confirmAccessChange && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3" role="alert">
                <p className="font-medium text-destructive">{t('confirmation.title')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('confirmation.description')}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>{t('cancel')}</Button>
              <Button type="submit" variant={confirmAccessChange ? 'destructive' : 'default'} disabled={saving || planState !== 'ready'}>
                {saving ? t('saving') : confirmAccessChange ? t('confirmation.submit') : editor?.mode === 'edit' ? t('saveChanges') : t('provision')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

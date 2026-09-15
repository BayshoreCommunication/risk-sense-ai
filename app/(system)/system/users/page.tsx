'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/types';

type SystemUser = components['schemas']['SystemUser'];
type Department = components['schemas']['SystemDepartment'];
type UserCreate = NonNullable<paths['/system/users']['post']['requestBody']>['content']['application/json'];
type UserPatch = NonNullable<paths['/system/users/{id}']['patch']['requestBody']>['content']['application/json'];
type Role = SystemUser['role'];

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

const EMPTY_USER: UserDraft = {
  email: '',
  name: '',
  role: 'requestor',
  departmentIds: [],
  crossDepartmentAccess: false,
  status: 'active',
};

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function errorMessage(result: { error?: unknown }) {
  return toApiError(result.error).message;
}

function sortUsers(users: SystemUser[]) {
  return [...users].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

/** Tenant-scoped provisioning and exactly-one-role administration (FR-02, FR-10, SEC-02). */
export default function UsersPage() {
  const locale = useLocale();
  const t = useTranslations('system.users');
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

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    const [usersResult, departmentsResult] = await Promise.all([api.GET('/system/users'), api.GET('/system/departments')]);
    setLoading(false);
    if (!usersResult.data) {
      setPageError(errorMessage(usersResult as { error?: unknown }));
      return;
    }
    if (!departmentsResult.data) {
      setPageError(errorMessage(departmentsResult as { error?: unknown }));
      return;
    }
    setUsers(sortUsers(usersResult.data.data));
    setDepartments(departmentsResult.data.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentNames = useMemo(() => new Map(departments.map((department) => [department._id, department.name])), [departments]);

  function updateDraft(next: Partial<UserDraft>) {
    setDraft((current) => ({ ...current, ...next }));
    setFormError(null);
    setConfirmAccessChange(false);
  }

  function openCreate() {
    setEditor({ mode: 'create', user: null });
    setDraft(EMPTY_USER);
    setFormError(null);
    setConfirmAccessChange(false);
  }

  function openEdit(user: SystemUser) {
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
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={openCreate}>{t('provision')}</Button>
      </div>

      {pageError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3" role="alert">
          <p className="text-sm text-destructive">{pageError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.user')}</TableHead>
              <TableHead>{t('columns.role')}</TableHead>
              <TableHead>{t('columns.departments')}</TableHead>
              <TableHead>{t('columns.mfa')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.lastLogin')}</TableHead>
              <TableHead className="text-right">{t('columns.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">{t('loading')}</TableCell>
              </TableRow>
            )}
            {!loading && !pageError && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">{t('empty')}</TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </TableCell>
                <TableCell>{roles.has(user.role) ? roles(user.role) : user.role}</TableCell>
                <TableCell className="max-w-64 whitespace-normal">
                  {user.role !== 'requestor'
                    ? t('scope.notApplicable')
                    : user.crossDepartmentAccess
                      ? t('scope.allDepartments')
                      : user.departmentIds.map((id) => departmentNames.get(id) ?? id).join(', ') || t('scope.ownOnly')}
                </TableCell>
                <TableCell><Badge variant={user.mfaEnrolled ? 'outline' : 'secondary'}>{user.mfaEnrolled ? t('mfa.enrolled') : t('mfa.pending')}</Badge></TableCell>
                <TableCell><Badge variant={user.status === 'active' ? 'outline' : 'destructive'}>{status.has(user.status) ? status(user.status) : user.status}</Badge></TableCell>
                <TableCell>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(locale) : t('never')}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openEdit(user)}>{t('edit')}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
                <Input id="user-email" type="email" value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} required disabled={editor?.mode === 'edit'} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="user-role">{t('fields.role')}</Label>
                <select
                  id="user-role"
                  className={selectClassName}
                  value={draft.role}
                  onChange={(event) => {
                    const role = event.target.value as Role;
                    updateDraft({ role, ...(role === 'requestor' ? {} : { departmentIds: [], crossDepartmentAccess: false }) });
                  }}
                >
                  {ROLES.map((role) => <option key={role} value={role}>{roles(role)}</option>)}
                </select>
              </div>
              {editor?.mode === 'edit' && (
                <div className="space-y-1">
                  <Label htmlFor="user-status">{t('fields.status')}</Label>
                  <select id="user-status" className={selectClassName} value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as SystemUser['status'] })}>
                    <option value="active">{status('active')}</option>
                    <option value="disabled">{status('disabled')}</option>
                  </select>
                </div>
              )}
            </div>

            {draft.role === 'requestor' && (
              <fieldset className="space-y-2 rounded-md border p-3">
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
              <Button type="submit" variant={confirmAccessChange ? 'destructive' : 'default'} disabled={saving}>
                {saving ? t('saving') : confirmAccessChange ? t('confirmation.submit') : editor?.mode === 'edit' ? t('saveChanges') : t('provision')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

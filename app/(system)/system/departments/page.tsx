'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/types';

type Department = components['schemas']['SystemDepartment'];
type Persona = components['schemas']['SystemPersona'];
type DepartmentCreate = NonNullable<paths['/system/departments']['post']['requestBody']>['content']['application/json'];
type DepartmentPatch = NonNullable<paths['/system/departments/{id}']['patch']['requestBody']>['content']['application/json'];
type Editor = { mode: 'create'; department: null } | { mode: 'edit'; department: Department };

const EMPTY_DEPARTMENT: DepartmentCreate = { name: '', personaIds: [] };

function errorMessage(result: { error?: unknown }) {
  return toApiError(result.error).message;
}

function sortDepartments(departments: Department[]) {
  return [...departments].sort((a, b) => a.name.localeCompare(b.name));
}

/** Department-to-persona administration. Catalog entries may come from tenant or shared active content (FR-10). */
export default function DepartmentsPage() {
  const t = useTranslations('system.departments');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<DepartmentCreate>(EMPTY_DEPARTMENT);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    const [departmentsResult, personasResult] = await Promise.all([api.GET('/system/departments'), api.GET('/system/personas')]);
    setLoading(false);
    if (!departmentsResult.data) {
      setPageError(errorMessage(departmentsResult as { error?: unknown }));
      return;
    }
    if (!personasResult.data) {
      setPageError(errorMessage(personasResult as { error?: unknown }));
      return;
    }
    setDepartments(sortDepartments(departmentsResult.data.data));
    setPersonas(personasResult.data.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const personasById = useMemo(() => new Map(personas.map((persona) => [persona._id, persona])), [personas]);

  function openCreate() {
    setEditor({ mode: 'create', department: null });
    setDraft(EMPTY_DEPARTMENT);
    setFormError(null);
  }

  function openEdit(department: Department) {
    setEditor({ mode: 'edit', department });
    setDraft({ name: department.name, personaIds: department.personaIds });
    setFormError(null);
  }

  function closeEditor() {
    if (!saving) setEditor(null);
  }

  function togglePersona(personaId: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      personaIds: checked ? [...new Set([...(current.personaIds ?? []), personaId])] : (current.personaIds ?? []).filter((id) => id !== personaId),
    }));
    setFormError(null);
  }

  async function save() {
    if (!editor) return;
    const name = draft.name.trim();
    if (name.length < 2) {
      setFormError(t('validation.name'));
      return;
    }
    const personaIds = draft.personaIds ?? [];
    let body: DepartmentCreate | DepartmentPatch = { name, personaIds };
    if (editor.mode === 'edit') {
      const patch: DepartmentPatch = {};
      if (name !== editor.department.name) patch.name = name;
      if ([...personaIds].sort().join(',') !== [...editor.department.personaIds].sort().join(',')) patch.personaIds = personaIds;
      if (Object.keys(patch).length === 0) {
        setFormError(t('validation.noChanges'));
        return;
      }
      body = patch;
    }

    setSaving(true);
    setFormError(null);
    setSaved(null);
    const result =
      editor.mode === 'create'
        ? await api.POST('/system/departments', { body: body as DepartmentCreate })
        : await api.PATCH('/system/departments/{id}', { params: { path: { id: editor.department._id } }, body: body as DepartmentPatch });
    setSaving(false);
    if (!result.data) {
      setFormError(errorMessage(result as { error?: unknown }));
      return;
    }
    const savedDepartment = result.data.data;
    setDepartments((current) => sortDepartments(editor.mode === 'create' ? [...current, savedDepartment] : current.map((department) => (department._id === savedDepartment._id ? savedDepartment : department))));
    setEditor(null);
    setSaved(t('saved', { name: savedDepartment.name }));
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={openCreate}>{t('newDepartment')}</Button>
      </div>

      {pageError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3" role="alert">
          <p className="text-sm text-destructive">{pageError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>{t('retry')}</Button>
        </div>
      )}
      {saved && <p className="rounded-md border bg-muted/20 p-3 text-sm" role="status">{saved}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.name')}</TableHead>
              <TableHead>{t('columns.personas')}</TableHead>
              <TableHead className="text-right">{t('columns.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t('loading')}</TableCell></TableRow>}
            {!loading && !pageError && departments.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t('empty')}</TableCell></TableRow>
            )}
            {departments.map((department) => (
              <TableRow key={department._id}>
                <TableCell className="font-medium">{department.name}</TableCell>
                <TableCell className="max-w-2xl whitespace-normal">
                  {department.personaIds.length === 0 ? (
                    <span className="text-muted-foreground">{t('noRestriction')}</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {department.personaIds.map((personaId) => {
                        const persona = personasById.get(personaId);
                        return <Badge key={personaId} variant="outline">{persona?.name ?? t('unavailablePersona', { id: personaId.slice(-6) })}</Badge>;
                      })}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openEdit(department)}>{t('editMapping')}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editor !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor?.mode === 'edit' ? t('dialog.editTitle', { name: editor.department.name }) : t('dialog.createTitle')}</DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="department-name">{t('fields.name')}</Label>
              <Input id="department-name" value={draft.name} minLength={2} required onChange={(event) => { setDraft((current) => ({ ...current, name: event.target.value })); setFormError(null); }} />
            </div>
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">{t('fields.availablePersonas')}</legend>
              {personas.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('personasEmpty')}</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {personas.map((persona) => (
                    <label key={persona._id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                      <input className="mt-0.5" type="checkbox" checked={(draft.personaIds ?? []).includes(persona._id)} onChange={(event) => togglePersona(persona._id, event.target.checked)} />
                      <span>
                        <span className="font-medium">{persona.name}</span>
                        <span className="block text-xs text-muted-foreground">{persona.sector} · {t('sourceContent', { source: persona.source })}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('allPersonasHint')}</p>
            </fieldset>
            {formError && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>{t('cancel')}</Button>
              <Button type="submit" disabled={saving}>{saving ? t('saving') : editor?.mode === 'edit' ? t('saveMapping') : t('createDepartment')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

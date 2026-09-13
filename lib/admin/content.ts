import { api, toApiError } from '@/lib/api/client';
import type { paths } from '@/lib/api/types';

/**
 * Typed helpers for the Administrator content screens (DASH-02). One object per entity so the
 * generic ContentManager component never has to cast API paths.
 */
export type Item = Record<string, unknown> & { _id: string; key: string; status: string; version?: number; isCurrent?: boolean };

export type PersonaCreate = NonNullable<paths['/personas']['post']['requestBody']>['content']['application/json'];
export type ScenarioCreate = NonNullable<paths['/scenarios']['post']['requestBody']>['content']['application/json'];
export type QuestionCreate = NonNullable<paths['/questions']['post']['requestBody']>['content']['application/json'];

function unwrap<T>(res: { data?: { data: T }; error?: unknown }): T {
  if (res.error || !res.data) throw toApiError(res.error);
  return res.data.data;
}

export interface EntityApi {
  list(query?: Record<string, string>): Promise<Item[]>;
  create(body: unknown): Promise<Item>;
  update(id: string, body: unknown): Promise<Item>;
  activate?(id: string): Promise<Item>;
  deactivate?(id: string): Promise<Item>;
  retire?(id: string): Promise<Item>;
  history?(id: string): Promise<Item[]>;
}

export const personasApi: EntityApi = {
  list: async (query) => unwrap(await api.GET('/personas', { params: { query: query as never } })) as Item[],
  create: async (body) => unwrap(await api.POST('/personas', { body: body as PersonaCreate })) as Item,
  update: async (id, body) => unwrap(await api.PATCH('/personas/{id}', { params: { path: { id } }, body: body as Partial<PersonaCreate> })) as Item,
  activate: async (id) => unwrap(await api.POST('/personas/{id}/activate', { params: { path: { id } } })) as Item,
  deactivate: async (id) => unwrap(await api.POST('/personas/{id}/deactivate', { params: { path: { id } } })) as Item,
  history: async (id) => unwrap(await api.GET('/personas/{id}/history', { params: { path: { id } } })) as Item[],
};

export const scenariosApi: EntityApi = {
  list: async (query) => unwrap(await api.GET('/scenarios', { params: { query: query as never } })) as Item[],
  create: async (body) => unwrap(await api.POST('/scenarios', { body: body as ScenarioCreate })) as Item,
  update: async (id, body) => unwrap(await api.PATCH('/scenarios/{id}', { params: { path: { id } }, body: body as Partial<ScenarioCreate> })) as Item,
  activate: async (id) => unwrap(await api.POST('/scenarios/{id}/activate', { params: { path: { id } } })) as Item,
  deactivate: async (id) => unwrap(await api.POST('/scenarios/{id}/deactivate', { params: { path: { id } } })) as Item,
  history: async (id) => unwrap(await api.GET('/scenarios/{id}/history', { params: { path: { id } } })) as Item[],
};

export const questionsApi: EntityApi = {
  list: async (query) => unwrap(await api.GET('/questions', { params: { query: query as never } })) as Item[],
  create: async (body) => unwrap(await api.POST('/questions', { body: body as QuestionCreate })) as Item,
  update: async (id, body) => unwrap(await api.PATCH('/questions/{id}', { params: { path: { id } }, body: body as Partial<QuestionCreate> })) as Item,
  retire: async (id) => unwrap(await api.POST('/questions/{id}/retire', { params: { path: { id } } })) as Item,
};

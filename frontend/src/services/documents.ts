import { request } from './api';

export interface DocumentMetadata {
  id: string;
  scope: string;
  title: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  category: string | null;
}
export interface SearchResult {
  query: string;
  pages: Array<{ page: string; title: string; excerpt: string }>;
  documents: DocumentMetadata[];
}

export function listDocuments(scope: string, query = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ scope });
  if (query.trim()) params.set('q', query.trim());
  return request<DocumentMetadata[]>(`/api/documents${query.trim() ? '/search' : ''}?${params}`, { signal });
}

export function uploadDocument(file: File, scope: string, options: { title?: string; category?: string } = {}) {
  const body = new FormData();
  body.append('file', file);
  body.append('scope', scope);
  if (options.title?.trim()) body.append('title', options.title.trim());
  if (options.category?.trim()) body.append('category', options.category.trim());
  return request<DocumentMetadata>('/api/documents', { method: 'POST', body });
}

export function deleteDocument(id: string) {
  return request<void>(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function documentDownloadUrl(id: string) {
  return `/api/documents/${encodeURIComponent(id)}/download`;
}

export function searchService(query: string, signal?: AbortSignal) {
  return request<SearchResult>(`/api/search?${new URLSearchParams({ q: query.trim() })}`, { signal });
}

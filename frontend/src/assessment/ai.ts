import { request } from '../services/api';
export const aiStatus = () => request<{available:boolean;model:string}>('/api/assessment/ai');
export const generateJson = (task:'report'|'draft',prompt:string,signal?:AbortSignal) =>
  request<Record<string,unknown>>('/api/assessment/ai',{method:'POST',body:JSON.stringify({task,prompt}),signal},125_000);

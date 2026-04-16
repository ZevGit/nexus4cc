import path from 'path';
import { AtomicStore } from './store.js';

//- Task store helpers (atomic operations on a JSON array of tasks)
let store = null;
const MAX_TASKS = 200;

export function initTasksStore(filePath) {
  store = new AtomicStore(filePath);
  return store;
}

export async function loadTasks() {
  if (!store) throw new Error('Tasks store not initialized. Call initTasksStore(filePath) first.');
  return await store.read();
}

export async function saveTasks(tasks) {
  if (!store) throw new Error('Tasks store not initialized.');
  const capped = Array.isArray(tasks) ? tasks.slice(-MAX_TASKS) : [];
  return await store.update(() => capped);
}

export async function updateTask(id, updates) {
  if (!store) throw new Error('Tasks store not initialized.');
  return await store.update((tasks) => {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], ...updates };
    }
    return tasks;
  });
}

export async function addTask(taskRecord) {
  if (!store) throw new Error('Tasks store not initialized.');
  return await store.update((tasks) => {
    const list = [...tasks, taskRecord];
    return list.length > MAX_TASKS ? list.slice(-MAX_TASKS) : list;
  });
}

export async function deleteTask(id) {
  if (!store) throw new Error('Tasks store not initialized.');
  return await store.update((tasks) => tasks.filter((t) => t.id !== id));
}

export async function cleanStaleTasks() {
  if (!store) throw new Error('Tasks store not initialized.');
  return await store.update((tasks) =>
    tasks.map((t) =>
      t.status === 'running' ? { ...t, status: 'error', note: '(服务重启，任务中断)' } : t
    )
  );
}

export async function getAllTasksSnapshot() {
  if (!store) throw new Error('Tasks store not initialized.');
  return await store.read();
}

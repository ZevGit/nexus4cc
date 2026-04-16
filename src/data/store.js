import fs from 'fs';
import path from 'path';

class AtomicStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.lock = false;
    this.queue = [];
    this.ensureDir();
  }

  async ensureDir() {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  async read() {
    try {
      const data = await fs.promises.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  async write(data) {
    const tmpPath = this.filePath + '.tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, this.filePath);
  }

  async update(fn) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          const current = await this.read();
          const next = await fn(current);
          // If fn returns undefined, assume no change
          const result = typeof next === 'undefined' ? current : next;
          await this.write(result);
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          // process next in queue
          this.lock = false;
          this.queue.shift();
          if (this.queue.length > 0) {
            this.lock = true;
            this.queue[0]();
          }
        }
      };

      this.queue.push(task);
      if (!this.lock) {
        this.lock = true;
        task();
      }
    });
  }
}

export { AtomicStore };

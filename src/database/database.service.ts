import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BetterSqlite3 = require('better-sqlite3');

@Injectable()
export class DatabaseService implements OnModuleInit {
  private db: ReturnType<typeof BetterSqlite3>;

  onModuleInit() {
    const dataDir = join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });

    this.db = new BetterSqlite3(join(dataDir, 'tasks.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date           TEXT    NOT NULL,
        project        TEXT    NOT NULL,
        description    TEXT    NOT NULL,
        startTime      TEXT,
        endTime        TEXT,
        completed      INTEGER NOT NULL DEFAULT 0,
        status         TEXT    NOT NULL DEFAULT 'done',
        resumeTime     TEXT,
        workedMinutes  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS projects (
        name TEXT PRIMARY KEY
      );

      INSERT OR IGNORE INTO projects (name) VALUES
        ('Voyage'), ('xflow/mcacl'), ('djanta/odoo'), ('Infrastructure'), ('Autre');
    `);

    // Migrations : ajouter les colonnes manquantes sur une DB existante
    const cols = (this.db.pragma('table_info(tasks)') as { name: string }[]).map(c => c.name);

    if (!cols.includes('status')) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'done'`);
    }
    if (!cols.includes('resumeTime')) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN resumeTime TEXT`);
    }
    if (!cols.includes('workedMinutes')) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN workedMinutes INTEGER NOT NULL DEFAULT 0`);
    }
    if (!cols.includes('pauseHistory')) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN pauseHistory TEXT NOT NULL DEFAULT '[]'`);
    }
  }

  getDb() {
    return this.db;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CreateTaskDto, UpdateTaskDto, CreateSubtaskDto } from '../dto/task.dto';
import { DatabaseService } from '../database/database.service';

export interface PauseEntry {
  pausedAt: string;    // HH:MM
  resumedAt?: string;  // HH:MM — absent si encore en pause
}

export interface Task {
  id: number;
  date: string;
  project: string;
  description: string;
  startTime?: string;
  endTime?: string;
  completed: boolean;
  status: 'template' | 'active' | 'paused' | 'done' | 'carried_over';
  resumeTime?: string;
  workedMinutes: number;
  pauseHistory: PauseEntry[];
  parentTaskId?: number;
  taskType: 'task' | 'subtask';
}

@Injectable()
export class TasksService {
  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) { }

  private get db() {
    return this.databaseService.getDb();
  }

  private rowToTask(row: any): Task {
    return {
      ...row,
      completed: row.completed === 1,
      status: row.status ?? 'done',
      pauseHistory: JSON.parse(row.pauseHistory || '[]'),
      taskType: row.taskType ?? 'task',
    };
  }

  private nowTime(): string {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  private todayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }


  // ── Tâches ──────────────────────────────────────────────────────────────────

  getAllTasks(): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks ORDER BY date DESC, id DESC')
      .all()
      .map((r: any) => this.rowToTask(r));
  }

  createTask(dto: CreateTaskDto): Task {
    const status = dto.status ?? 'done';

    let startTime: string | null = dto.startTime ?? null;
    let endTime: string | null = dto.endTime ?? null;
    let completed = 0;

    let resumeTime: string | null = null;
    let workedMinutes = 0;

    if (status === 'active') {
      startTime = startTime ?? this.nowTime();
      resumeTime = startTime; // obligatoire pour que stopTask calcule la durée correctement
      endTime = null;
      completed = 0;
    } else if (status === 'template') {
      startTime = null;
      endTime = null;
      completed = 0;
    } else {
      // 'done' — saisie manuelle passée
      completed = 1;
    }

    const result = this.db
      .prepare(
        'INSERT INTO tasks (date, project, description, startTime, endTime, completed, status, resumeTime, workedMinutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(dto.date, dto.project, dto.description, startTime, endTime, completed, status, resumeTime, workedMinutes);

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
  }

  updateTask(id: number, dto: UpdateTaskDto): Task {
    const existing = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!existing) throw new NotFoundException('Tâche non trouvée');

    const merged = { ...existing, ...dto, completed: dto.completed !== undefined ? (dto.completed ? 1 : 0) : existing.completed };
    this.db
      .prepare(
        'UPDATE tasks SET date=?, project=?, description=?, startTime=?, endTime=?, completed=?, status=? WHERE id=?',
      )
      .run(
        merged.date,
        merged.project,
        merged.description,
        merged.startTime ?? null,
        merged.endTime ?? null,
        merged.completed,
        merged.status ?? 'done',
        id,
      );

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  deleteTask(id: number): void {
    this.db.prepare("DELETE FROM tasks WHERE parentTaskId = ? AND taskType = 'subtask'").run(id);
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  /** Crée une sous-tâche rattachée à une tâche parente (hérite du projet). */
  createSubtask(parentId: number, dto: CreateSubtaskDto): Task {
    const parent = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(parentId) as any;
    if (!parent) throw new NotFoundException('Tâche parente non trouvée');

    const status = dto.status ?? 'template';
    const today = this.todayDate();
    let startTime: string | null = null;
    let resumeTime: string | null = null;

    if (status === 'active') {
      startTime = this.nowTime();
      resumeTime = startTime;
    }

    const result = this.db
      .prepare(
        'INSERT INTO tasks (date, project, description, startTime, status, completed, resumeTime, workedMinutes, pauseHistory, parentTaskId, taskType) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)',
      )
      .run(today, parent.project, dto.description, startTime, status, resumeTime, '[]', parentId, 'subtask');

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
  }

  toggleComplete(id: number): Task {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!task) throw new NotFoundException('Tâche non trouvée');

    const newCompleted = task.completed ? 0 : 1;
    const newStatus = newCompleted ? 'done' : (task.startTime ? 'active' : 'template');
    this.db.prepare('UPDATE tasks SET completed=?, status=? WHERE id=?').run(newCompleted, newStatus, id);

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  /** Démarre une tâche prédéfinie : capture l'heure de début maintenant */
  startTask(id: number): Task {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!task) throw new NotFoundException('Tâche non trouvée');

    const now = this.nowTime();
    const today = this.todayDate();
    this.db
      .prepare('UPDATE tasks SET startTime=?, resumeTime=?, workedMinutes=0, pauseHistory=?, date=?, status=?, completed=0 WHERE id=?')
      .run(now, now, '[]', today, 'active', id);

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  /** Met en pause une tâche en cours : enregistre l'heure de pause dans l'historique */
  pauseTask(id: number): Task {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!task) throw new NotFoundException('Tâche non trouvée');
    if (task.status !== 'active') throw new Error('La tâche n\'est pas en cours');

    const now = this.nowTime();
    const sessionMinutes = task.resumeTime
      ? Math.max(0, this.timeToMinutes(now) - this.timeToMinutes(task.resumeTime))
      : 0;
    const totalWorked = (task.workedMinutes ?? 0) + sessionMinutes;

    const history: PauseEntry[] = JSON.parse(task.pauseHistory || '[]');
    history.push({ pausedAt: now });

    this.db
      .prepare('UPDATE tasks SET workedMinutes=?, pauseHistory=?, status=? WHERE id=?')
      .run(totalWorked, JSON.stringify(history), 'paused', id);

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  /** Reprend une tâche en pause : enregistre l'heure de reprise dans l'historique */
  resumeTask(id: number): Task {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!task) throw new NotFoundException('Tâche non trouvée');
    if (task.status !== 'paused') throw new Error('La tâche n\'est pas en pause');

    const now = this.nowTime();
    const history: PauseEntry[] = JSON.parse(task.pauseHistory || '[]');
    const last = history[history.length - 1];
    if (last && !last.resumedAt) last.resumedAt = now;

    this.db
      .prepare('UPDATE tasks SET resumeTime=?, pauseHistory=?, status=? WHERE id=?')
      .run(now, JSON.stringify(history), 'active', id);

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  /** Termine une tâche : endTime = heure réelle du clic, workedMinutes = temps net hors pauses */
  stopTask(id: number): Task {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!task) throw new NotFoundException('Tâche non trouvée');

    const now = this.nowTime();

    // Temps net travaillé depuis le dernier resume (pour les stats, hors pauses)
    const sessionMinutes = task.resumeTime
      ? Math.max(0, this.timeToMinutes(now) - this.timeToMinutes(task.resumeTime))
      : 0;
    const totalWorked = (task.workedMinutes ?? 0) + sessionMinutes;

    // endTime = heure réelle de terminaison (jamais calculée, toujours le now)
    this.db
      .prepare('UPDATE tasks SET endTime=?, workedMinutes=?, status=?, completed=1 WHERE id=?')
      .run(now, totalWorked, 'done', id);

    return this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  // ── Report sur les jours ──────────────────────────────────────────────────────

  /**
   * Reporte les tâches actives/en pause des jours précédents vers aujourd'hui.
   * - L'ancienne entrée passe en status 'carried_over'
   * - Une nouvelle tâche template est créée pour aujourd'hui avec parentTaskId
   */
  rolloverTasks(today: string): { rolledOver: number; tasks: Task[] } {
    const stale = this.db
      .prepare("SELECT * FROM tasks WHERE status IN ('active', 'paused') AND date < ?")
      .all(today) as any[];

    const newTasks: Task[] = [];

    for (const task of stale) {
      // Fermer l'ancienne entrée
      this.db.prepare("UPDATE tasks SET status='carried_over' WHERE id=?").run(task.id);

      // Créer la continuation pour aujourd'hui
      const result = this.db
        .prepare(
          'INSERT INTO tasks (date, project, description, status, completed, workedMinutes, pauseHistory, parentTaskId) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
        )
        .run(today, task.project, task.description, 'template', task.workedMinutes ?? 0, '[]', task.id);

      newTasks.push(this.rowToTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid)));
    }

    return { rolledOver: stale.length, tasks: newTasks };
  }

  // ── Projets ─────────────────────────────────────────────────────────────────

  getAllProjects(): string[] {
    return (this.db.prepare('SELECT name FROM projects ORDER BY name').all() as { name: string }[]).map(r => r.name);
  }

  addProject(name: string): string[] {
    this.db.prepare('INSERT OR IGNORE INTO projects (name) VALUES (?)').run(name);
    return this.getAllProjects();
  }

  deleteProject(name: string): string[] {
    this.db.prepare('DELETE FROM projects WHERE name = ?').run(name);
    return this.getAllProjects();
  }

  // ── Utilitaires rapports ─────────────────────────────────────────────────────

  private calculateDuration(start: string, end: string): string {
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    const diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) return '0h00';
    return `${Math.floor(diff / 60)}h${(diff % 60).toString().padStart(2, '0')}`;
  }

  private parseDurationToMinutes(duration: string): number {
    const match = duration.match(/(\d+)h(\d+)/);
    if (!match) return 0;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  private formatMinutes(minutes: number): string {
    return `${Math.floor(minutes / 60)}h${(minutes % 60).toString().padStart(2, '0')}`;
  }

  /** Construit le corps texte du rapport à partir d'une liste de tâches (tous statuts). */
  private buildReportText(tasks: Task[]): string {
    const subtasksByParent = tasks
      .filter(t => t.taskType === 'subtask')
      .reduce((acc, t) => { (acc[t.parentTaskId!] = acc[t.parentTaskId!] ?? []).push(t); return acc; }, {} as Record<number, Task[]>);

    const topLevel      = tasks.filter(t => t.taskType !== 'subtask');
    const doneTasks        = topLevel.filter(t => t.status === 'done');
    const activeTasks      = topLevel.filter(t => t.status === 'active' || t.status === 'paused');
    const templateTasks    = topLevel.filter(t => t.status === 'template');
    const carriedOverTasks = topLevel.filter(t => t.status === 'carried_over');

    let summary = '';
    let totalMinutes = 0;

    // ── Tâches terminées, groupées par date ───────────────────────────────────
    if (doneTasks.length > 0) {
      const byDate = doneTasks.reduce((acc, t) => {
        (acc[t.date] = acc[t.date] ?? []).push(t);
        return acc;
      }, {} as Record<string, Task[]>);

      Object.entries(byDate).sort().forEach(([date, dateTasks]) => {
        const d = new Date(date + 'T12:00:00');
        summary += `${d.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase()} - ${d.toLocaleDateString('fr-FR')}\n`;
        summary += `${'-'.repeat(40)}\n`;

        let dayMinutes = 0;
        dateTasks.forEach(task => {
          let timeStr = '';
          if (task.startTime && task.endTime) {
            const dur = this.calculateDuration(task.startTime, task.endTime);
            timeStr = ` [${task.startTime} - ${task.endTime}] (${dur})`;
            dayMinutes += this.parseDurationToMinutes(dur);
          } else if (task.startTime) {
            timeStr = ` [${task.startTime}]`;
          }
          summary += `✓ [${task.project}] ${task.description}${timeStr}\n`;
          if (task.pauseHistory?.length > 0) {
            task.pauseHistory.forEach((p: PauseEntry) => {
              const pauseMin = p.resumedAt
                ? Math.max(0, this.timeToMinutes(p.resumedAt) - this.timeToMinutes(p.pausedAt))
                : 0;
              const durStr = pauseMin > 0 ? ` (${this.formatMinutes(pauseMin)} en pause)` : '';
              summary += `     ⏸ Pause ${p.pausedAt} → ▶ Reprise ${p.resumedAt ?? '(en cours)'}${durStr}\n`;
            });
          }
          (subtasksByParent[task.id] ?? []).forEach(sub => {
            const icon = sub.status === 'done' && sub.completed ? '  ✓' : sub.status === 'active' ? '  ▶' : sub.status === 'paused' ? '  ⏸' : '  ◷';
            const subTime = sub.workedMinutes > 0 ? ` (${this.formatMinutes(sub.workedMinutes)})` : '';
            summary += `${icon} ${sub.description}${subTime}\n`;
          });
        });

        if (dayMinutes > 0) {
          summary += `  → Total journée : ${this.formatMinutes(dayMinutes)}\n`;
          totalMinutes += dayMinutes;
        }
        summary += `\n`;
      });
    } else {
      summary += `Aucune tâche terminée.\n\n`;
    }

    // ── Tâches en cours ou en pause ───────────────────────────────────────────
    if (activeTasks.length > 0) {
      summary += `EN COURS / EN PAUSE\n`;
      summary += `${'-'.repeat(40)}\n`;
      activeTasks.forEach(task => {
        const label = task.status === 'active' ? '▶ En cours' : '⏸ En pause';
        let timeStr = task.startTime ? ` — démarré à ${task.startTime}` : '';
        if (task.workedMinutes > 0) timeStr += `, travaillé ${this.formatMinutes(task.workedMinutes)}`;
        summary += `${label}  [${task.project}] ${task.description}${timeStr}\n`;
        if (task.pauseHistory?.length > 0) {
          task.pauseHistory.forEach((p: PauseEntry) => {
            const pauseMin = p.resumedAt
              ? Math.max(0, this.timeToMinutes(p.resumedAt) - this.timeToMinutes(p.pausedAt))
              : 0;
            const durStr = pauseMin > 0 ? ` (${this.formatMinutes(pauseMin)})` : '';
            summary += `     ⏸ ${p.pausedAt} → ▶ ${p.resumedAt ?? '(en cours)'}${durStr}\n`;
          });
        }
      });
      summary += `\n`;
    }

    // ── Tâches planifiées non démarrées ───────────────────────────────────────
    if (templateTasks.length > 0) {
      summary += `PLANIFIÉES (NON DÉMARRÉES)\n`;
      summary += `${'-'.repeat(40)}\n`;
      templateTasks.forEach(task => {
        const suite = task.parentTaskId ? ` [suite J-1]` : '';
        summary += `◷ [${task.project}] ${task.description}${suite}\n`;
        if (task.workedMinutes > 0) summary += `     Temps cumulé (J-1) : ${this.formatMinutes(task.workedMinutes)}\n`;
      });
      summary += `\n`;
    }

    // ── Tâches reportées (en cours hier, continuées aujourd'hui) ──────────────
    if (carriedOverTasks.length > 0) {
      summary += `EN COURS HIER (REPORTÉES AU LENDEMAIN)\n`;
      summary += `${'-'.repeat(40)}\n`;
      let carriedMinutes = 0;
      carriedOverTasks.forEach(task => {
        let timeStr = task.startTime ? ` — démarré à ${task.startTime}` : '';
        if (task.workedMinutes > 0) timeStr += `, travaillé ${this.formatMinutes(task.workedMinutes)}`;
        summary += `→ [${task.project}] ${task.description}${timeStr}\n`;
        carriedMinutes += task.workedMinutes ?? 0;
      });
      if (carriedMinutes > 0) {
        summary += `  → Temps travaillé (reporté) : ${this.formatMinutes(carriedMinutes)}\n`;
        totalMinutes += carriedMinutes;
      }
      summary += `\n`;
    }

    // ── Statistiques ──────────────────────────────────────────────────────────
    summary += `${'='.repeat(60)}\n`;
    summary += `STATISTIQUES\n`;
    summary += `${'-'.repeat(40)}\n`;
    summary += `Terminées      : ${doneTasks.length}\n`;
    if (activeTasks.length > 0) summary += `En cours/pause : ${activeTasks.length}\n`;
    if (carriedOverTasks.length > 0) summary += `Reportées      : ${carriedOverTasks.length}\n`;
    if (templateTasks.length > 0) summary += `Planifiées     : ${templateTasks.length}\n`;
    summary += `Total          : ${tasks.length}\n`;
    if (totalMinutes > 0) summary += `Temps travaillé : ${this.formatMinutes(totalMinutes)}\n`;

    const projectStats = doneTasks.reduce((acc, t) => {
      acc[t.project] = (acc[t.project] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (Object.keys(projectStats).length > 0) {
      summary += `\nPar projet (tâches terminées) :\n`;
      Object.entries(projectStats).forEach(([p, n]) => {
        summary += `  - ${p} : ${n} tâche(s)\n`;
      });
    }

    return summary;
  }

  private buildPrompt(input: object[]): string {
    return `Tu es un assistant qui professionnalise les descriptions de tâches DevOps.
Pour chaque tâche, corrige l'orthographe, améliore la formulation et utilise un ton professionnel et concis.
Réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{ "tasks": [ {"id": 123, "improvedDescription": "Description pro ici"} ] }
Tâches :
${JSON.stringify(input, null, 2)}`;
  }

  private parseAIResponse(text: string, tasks: Task[]): Task[] {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const improved: { id: number; improvedDescription: string }[] = parsed.tasks;
    if (!Array.isArray(improved)) throw new Error('Format de réponse IA invalide');
    return tasks.map(t => {
      const imp = improved.find(i => i.id === t.id);
      return imp ? { ...t, description: imp.improvedDescription } : t;
    });
  }

  /** Améliore les descriptions via Groq, Gemini ou Anthropic selon AI_PROVIDER. */
  private async improveWithAI(tasks: Task[]): Promise<Task[]> {
    const provider = (this.configService.get<string>('AI_PROVIDER') ?? 'anthropic').toLowerCase();
    const apiKey = this.configService.get<string>('AI_API_KEY');
    const model = this.configService.get<string>('AI_MODEL');
    const maxTokens = parseInt(this.configService.get<string>('AI_MAX_TOKENS') ?? '4000', 10);

    if (!apiKey) throw new Error(`AI_API_KEY non configurée (provider: ${provider})`);

    const input = tasks.map(({ id, description, project, date, status }) => ({ id, description, project, date, status }));
    const prompt = this.buildPrompt(input);
    let aiText = '';

    // ── Groq (OpenAI-compatible) ────────────────────────────────────────────
    if (provider === 'groq') {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` } },
      );
      aiText = res.data.choices?.[0]?.message?.content ?? '';

      // ── Gemini ───────────────────────────────────────────────────────────────
    } else if (provider === 'gemini') {
      const geminiModel = model ?? 'gemini-2.0-flash';
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } },
        { headers: { 'Content-Type': 'application/json' } },
      );
      aiText = res.data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      // ── Anthropic (défaut) ───────────────────────────────────────────────────
    } else {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } },
      );
      aiText = res.data.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
    }

    if (!aiText) throw new Error('Pas de réponse de l\'IA');
    return this.parseAIResponse(aiText, tasks);
  }

  // ── Exports ──────────────────────────────────────────────────────────────────

  exportDailySummary(date: string): string {
    const tasks = this.getAllTasks().filter(t => t.date === date);
    const d = new Date(date + 'T12:00:00');
    const header = `RAPPORT JOURNALIER - TÂCHES DEVOPS\n`
      + `${d.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase()} ${d.toLocaleDateString('fr-FR')}\n`
      + `\n${'='.repeat(60)}\n\n`;
    return header + this.buildReportText(tasks);
  }

  async exportDailyProfessionalReport(date: string): Promise<string> {
    const tasks = this.getAllTasks().filter(t => t.date === date);
    if (tasks.length === 0) throw new Error('Aucune tâche pour ce jour');

    try {
      const improved = await this.improveWithAI(tasks);
      const d = new Date(date + 'T12:00:00');
      const header = `RAPPORT JOURNALIER - TÂCHES DEVOPS (VERSION PROFESSIONNELLE)\n`
        + `${d.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase()} ${d.toLocaleDateString('fr-FR')}\n`
        + `\n${'='.repeat(60)}\n\n`;
      return header + this.buildReportText(improved);
    } catch (error) {
      console.error('Erreur API Anthropic:', error);
      throw new Error('Erreur lors de la génération du rapport journalier professionnel');
    }
  }

  exportWeeklySummary(weekStart: string): string {
    const from = new Date(weekStart + 'T00:00:00');
    const tasks = this.getAllTasks().filter(t => new Date(t.date + 'T00:00:00') >= from);
    const header = `RAPPORT HEBDOMADAIRE - TÂCHES DEVOPS\n`
      + `Période : ${from.toLocaleDateString('fr-FR')} - ${new Date().toLocaleDateString('fr-FR')}\n`
      + `\n${'='.repeat(60)}\n\n`;
    return header + this.buildReportText(tasks);
  }

  async exportProfessionalReport(weekStart: string): Promise<string> {
    const from = new Date(weekStart + 'T00:00:00');
    const tasks = this.getAllTasks().filter(t => new Date(t.date + 'T00:00:00') >= from);
    if (tasks.length === 0) throw new Error('Aucune tâche à exporter pour cette semaine');

    try {
      const improved = await this.improveWithAI(tasks);
      const header = `RAPPORT HEBDOMADAIRE - TÂCHES DEVOPS (VERSION PROFESSIONNELLE)\n`
        + `Période : ${from.toLocaleDateString('fr-FR')} - ${new Date().toLocaleDateString('fr-FR')}\n`
        + `\n${'='.repeat(60)}\n\n`;
      return header + this.buildReportText(improved);
    } catch (error) {
      console.error('Erreur API Anthropic:', error);
      throw new Error('Erreur lors de la génération du rapport professionnel');
    }
  }
}

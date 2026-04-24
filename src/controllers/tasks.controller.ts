import { Controller, Get, Post, Put, Delete, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { TasksService } from '../services/tasks.service';
import { CreateTaskDto, UpdateTaskDto, ExportWeeklyDto, ExportProfessionalDto, ExportDailyDto, RolloverDto, CreateSubtaskDto } from '../dto/task.dto';

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  getAllTasks() {
    return this.tasksService.getAllTasks();
  }

  @Post()
  createTask(@Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(dto);
  }

  // Routes littérales en premier pour éviter les conflits avec :id
  @Post('export/daily')
  exportDaily(@Body() dto: ExportDailyDto) {
    const summary  = this.tasksService.exportDailySummary(dto.date);
    const dateSlug = dto.date.replace(/-/g, '');
    return { content: summary, filename: `rapport_journalier_${dateSlug}.txt` };
  }

  @Post('export/daily-pro')
  async exportDailyPro(@Body() dto: ExportDailyDto) {
    try {
      const summary  = await this.tasksService.exportDailyProfessionalReport(dto.date);
      const dateSlug = dto.date.replace(/-/g, '');
      return { content: summary, filename: `rapport_journalier_pro_${dateSlug}.txt` };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('rollover')
  rolloverTasks(@Body() dto: RolloverDto) {
    return this.tasksService.rolloverTasks(dto.date);
  }

  @Post('export/weekly')
  exportWeekly(@Body() dto: ExportWeeklyDto) {
    const summary = this.tasksService.exportWeeklySummary(dto.weekStart);
    return {
      content: summary,
      filename: `rapport_hebdo_${new Date().toISOString().split('T')[0]}.txt`,
    };
  }

  @Post('export/professional')
  async exportProfessional(@Body() dto: ExportProfessionalDto) {
    try {
      const summary = await this.tasksService.exportProfessionalReport(dto.weekStart);
      return {
        content: summary,
        filename: `rapport_hebdo_pro_${new Date().toISOString().split('T')[0]}.txt`,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':id')
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    try {
      return this.tasksService.updateTask(Number(id), dto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Delete(':id')
  deleteTask(@Param('id') id: string) {
    this.tasksService.deleteTask(Number(id));
    return { message: 'Tâche supprimée avec succès' };
  }

  @Post(':id/toggle')
  toggleComplete(@Param('id') id: string) {
    try {
      return this.tasksService.toggleComplete(Number(id));
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Post(':id/subtasks')
  createSubtask(@Param('id') id: string, @Body() dto: CreateSubtaskDto) {
    try {
      return this.tasksService.createSubtask(Number(id), dto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':id/start')
  startTask(@Param('id') id: string) {
    try {
      return this.tasksService.startTask(Number(id));
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Post(':id/pause')
  pauseTask(@Param('id') id: string) {
    try {
      return this.tasksService.pauseTask(Number(id));
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':id/resume')
  resumeTask(@Param('id') id: string) {
    try {
      return this.tasksService.resumeTask(Number(id));
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post(':id/stop')
  stopTask(@Param('id') id: string) {
    try {
      return this.tasksService.stopTask(Number(id));
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}

@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  getAllProjects() {
    return this.tasksService.getAllProjects();
  }

  @Post()
  addProject(@Body('name') name: string) {
    return this.tasksService.addProject(name);
  }

  @Delete(':name')
  deleteProject(@Param('name') name: string) {
    return this.tasksService.deleteProject(name);
  }
}

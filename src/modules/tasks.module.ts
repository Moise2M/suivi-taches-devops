import { Module } from '@nestjs/common';
import { TasksController, ProjectsController } from '../controllers/tasks.controller';
import { TasksService } from '../services/tasks.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TasksController, ProjectsController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}

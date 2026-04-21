import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  project: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsIn(['template', 'active', 'paused', 'done'])
  @IsOptional()
  status?: 'template' | 'active' | 'paused' | 'done';
}

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  project?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsIn(['template', 'active', 'paused', 'done'])
  @IsOptional()
  status?: 'template' | 'active' | 'paused' | 'done';
}

export class ExportWeeklyDto {
  @IsString()
  @IsNotEmpty()
  weekStart: string;
}

export class ExportProfessionalDto {
  @IsString()
  @IsNotEmpty()
  weekStart: string;
}

export class ExportDailyDto {
  @IsString()
  @IsNotEmpty()
  date: string;
}

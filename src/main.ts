import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Configuration CORS
  const configService = app.get(ConfigService);
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || '*',
    credentials: true,
  });

  // Validation automatique des DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = configService.get('PORT') || 3000;
  await app.listen(port);
  
  console.log(`🚀 Application démarrée sur http://localhost:${port}`);
  console.log(`📊 Frontend disponible sur http://localhost:${port}`);
  console.log(`🔌 API disponible sur http://localhost:${port}/api`);
}

bootstrap();

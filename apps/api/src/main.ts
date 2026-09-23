import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Input validation is zod, not class-validator: the browser previews a CSV
  // with the very same schemas the server then re-checks (tech-stack 2). Each
  // handler validates its body with ZodValidationPipe.
  configureApp(app);

  const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);
  await app.listen(port);
  new Logger('Bootstrap').log(`API Faffa Go sur le port ${port}`);
}

void bootstrap();

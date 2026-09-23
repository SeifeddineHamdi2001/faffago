import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Money crosses the wire as a string, everywhere, without exception.
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  app.setGlobalPrefix('api');

  // Input validation is zod, not class-validator: the browser previews a CSV
  // with the very same schemas the server then re-checks (tech-stack 2). The
  // ZodValidationPipe arrives with the first endpoints.

  const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);
  await app.listen(port);
  new Logger('Bootstrap').log(`API Faffa Go sur le port ${port}`);
}

void bootstrap();

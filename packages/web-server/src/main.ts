import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { getServerConfig } from '@mcp-planner/config/server';
import { setFallbackProjectId } from '@mcp-planner/core';
import { AppModule } from './app.module.js';
import {
  GlobalExceptionFilter,
  TransformInterceptor,
  LoggingInterceptor,
  createValidationPipe,
} from './common/index.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const serverConfig = getServerConfig();

  // GREEN: Phase 2.4.3 - Set fallback projectId for single-project mode
  // Web-server uses 'default' project until multi-project middleware is implemented
  setFallbackProjectId('default');

  // Enable CORS for development (Angular)
  app.enableCors({
    origin: serverConfig.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global pipes, filters, interceptors
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('MCP Planning Server')
    .setDescription('REST API for MCP Planning Web Dashboard')
    .setVersion('1.0')
    .addTag('plans', 'Plan management')
    .addTag('requirements', 'Requirement management')
    .addTag('solutions', 'Solution management')
    .addTag('decisions', 'Decision (ADR) management')
    .addTag('phases', 'Phase hierarchy management')
    .addTag('artifacts', 'Artifact management')
    .addTag('links', 'Entity linking')
    .addTag('query', 'Search and analysis')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Get port from config
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? serverConfig.port;
  await app.listen(port);

  console.log(`MCP Planning Server running on http://localhost:${String(port)}`);
  console.log(`Swagger UI available at http://localhost:${String(port)}/${serverConfig.apiPrefix}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

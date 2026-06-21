import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.enableCors({ origin: config.get('FRONTEND_URL', 'http://localhost:4200'), credentials: true });
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();

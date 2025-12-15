import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configuration, configValidationSchema } from './configuration.js';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configValidationSchema,
      validationOptions: {
        abortEarly: true,
      },
      envFilePath: ['.env.local', '.env'],
    }),
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- NestJS module pattern requires class with decorator
export class AppConfigModule {}

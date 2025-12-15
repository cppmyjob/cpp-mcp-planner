import Joi from 'joi';

const DEFAULT_PORT = 3000;

export interface AppConfig {
  port: number;
  nodeEnv: string;
  storagePath: string;
}

export const configValidationSchema = Joi.object({
  PORT: Joi.number().default(DEFAULT_PORT),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  STORAGE_PATH: Joi.string().required(),
});

export function configuration(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    storagePath: process.env.STORAGE_PATH ?? '',
  };
}

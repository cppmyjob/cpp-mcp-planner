import { getWebServerPort, WEB_SERVER_PORT, ENV_VAR_NAMES } from '@mcp-planner/config/server';
import Joi from 'joi';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  storagePath: string;
}

export const configValidationSchema = Joi.object({
  [ENV_VAR_NAMES.WEB_SERVER_PORT]: Joi.number().default(WEB_SERVER_PORT),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  STORAGE_PATH: Joi.string().required(),
});

export function configuration(): AppConfig {
  return {
    port: getWebServerPort(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    storagePath: process.env.STORAGE_PATH ?? '',
  };
}

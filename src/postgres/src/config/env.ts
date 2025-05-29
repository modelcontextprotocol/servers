import dotenv from 'dotenv';
dotenv.config();

export function getEnvVar(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === null) {
    throw new Error(`${name} is not defined`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

export const config = {
  postgres: {
    username: getEnvVar('POSTGRES_USERNAME'),
    password: getEnvVar('POSTGRES_PASSWORD'),
    host: getEnvVar('POSTGRES_HOST'),
    database: getEnvVar('POSTGRES_DATABASE'),
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    corsOrigins: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:8080', 'http://localhost:3000'],
  },
};

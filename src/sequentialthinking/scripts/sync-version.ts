import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const version = packageJson.version;

const configPath = path.join(__dirname, 'config.ts');
let configContent = fs.readFileSync(configPath, 'utf-8');

// Update the default version in config.ts
configContent = configContent.replace(
  /version: process\.env\.SERVER_VERSION \?\s*['"][^'"]+['"]/,
  `version: process.env.SERVER_VERSION ?? '${version}'`
);

fs.writeFileSync(configPath, configContent);
console.log(`Updated config.ts with version ${version}`);

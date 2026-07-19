
import * as fs from 'fs/promises';
import * as path from 'path';
import { applyFileEdits } from './lib.js';

async function reproduce() {
  const testFile = path.join(process.cwd(), 'test_dollar.txt');
  const initialContent = 'Value: OLD_VALUE\n';
  await fs.writeFile(testFile, initialContent);

  console.log('Initial content:', initialContent);

  const edits = [
    {
      oldText: 'OLD_VALUE',
      newText: '$100'
    }
  ];

  try {
    await applyFileEdits(testFile, edits, false);
    const result = await fs.readFile(testFile, 'utf-8');
    console.log('Resulting content:', result);
    
    if (result.includes('$100')) {
      console.log('SUCCESS: $100 preserved');
    } else {
      console.log('FAILURE: $100 corrupted. Found:', result);
    }
  } catch (error) {
    console.error('Error during reproduction:', error);
  } finally {
    await fs.unlink(testFile);
  }
}

reproduce();

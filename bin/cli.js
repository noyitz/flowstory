#!/usr/bin/env node

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'validate': {
    const file = args[1];
    if (!file) {
      console.error('Usage: flowstory validate <diagram.json>');
      process.exit(1);
    }
    const { validateDiagram } = await import('../src/schema/validator.js');
    const diagram = JSON.parse(readFileSync(resolve(file), 'utf-8'));
    const result = validateDiagram(diagram);
    if (result.valid) {
      console.log('✓ Valid FlowStory diagram');
      process.exit(0);
    } else {
      console.error('✗ Invalid diagram:');
      result.errors.forEach(e => console.error(`  ${e}`));
      process.exit(1);
    }
    break;
  }

  case 'prompt': {
    const promptPath = resolve(__dirname, '..', 'docs', 'agent-prompt.md');
    try {
      const content = readFileSync(promptPath, 'utf-8');
      console.log(content);
    } catch {
      console.error('agent-prompt.md not found at', promptPath);
      process.exit(1);
    }
    break;
  }

  case 'dev': {
    const port = args[1] || 9000;
    const { createServer } = await import('http');
    const { readFile } = await import('fs/promises');
    const { join, extname } = await import('path');

    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    };

    createServer(async (req, res) => {
      const url = req.url === '/' ? '/index.html' : req.url;
      const filePath = join(process.cwd(), url);
      try {
        const data = await readFile(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    }).listen(port, () => {
      console.log(`FlowStory dev server running at http://localhost:${port}`);
    });
    break;
  }

  default:
    console.log(`FlowStory CLI

Usage:
  flowstory validate <diagram.json>  Validate a diagram against the schema
  flowstory prompt                   Print the AI agent prompt to stdout
  flowstory dev [port]               Start a dev server (default: 9000)
`);
    break;
}

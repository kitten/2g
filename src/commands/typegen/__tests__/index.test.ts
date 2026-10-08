import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import { generateEventRegistryTypes, runTypegenCli } from '../index';

describe('typegen', () => {
  it('generates valid declarations for quoted optional payload properties', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-typegen-'));
    const names = [
      'content-type',
      'http.status',
      'a"b',
      "a'b",
      'path\\name',
      'line\nbreak',
    ];
    const project = path.join(dir, 'tsconfig.json');
    try {
      await fs.writeFile(
        project,
        JSON.stringify({
          compilerOptions: { strict: true, types: [] },
          files: ['events.ts'],
        })
      );
      await fs.writeFile(
        path.join(dir, 'events.ts'),
        `
        declare module '2g' {
          interface EventRegistry {
            'test:done': {
              ${names.map(name => `${JSON.stringify(name)}?: string;`).join('\n')}
            }
          }
        }
      `
      );
      expect(
        JSON.parse(generateEventRegistryTypes({ project, format: 'json' }))
      ).toEqual([
        expect.objectContaining({
          fields: Object.fromEntries(
            names.map(name => [name, 'string | undefined'])
          ),
          optionalFields: names,
        }),
      ]);
      const declaration = path.join(dir, 'generated.d.ts');
      await fs.writeFile(declaration, generateEventRegistryTypes({ project }));
      const consumer = path.join(dir, 'consumer.ts');
      await fs.writeFile(
        consumer,
        `
        import type { EventRegistry } from '2g';
        const empty: EventRegistry['test:done'] = {};
        const filled: EventRegistry['test:done'] = {
          ${names.map(name => `${JSON.stringify(name)}: 'value',`).join('\n')}
        };
      `
      );
      const program = ts.createProgram([declaration, consumer], {
        strict: true,
        noEmit: true,
        types: [],
      });
      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map(diagnostic =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          )
      ).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('generates module augmentations for 2g', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-typegen-'));
    await fs.mkdir(path.join(dir, 'vendor/2g'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'vendor/2g/index.ts'),
      `
        export interface EventRegistry {}
        export function events(category: string): unknown;
      `
    );
    await fs.writeFile(
      path.join(dir, 'events.ts'),
      `
        import { events } from '2g';
        declare module '2g' {
          interface EventRegistry {
            'test:done': { count: number; label?: string };
          }
        }
        events('test');
      `
    );
    await fs.writeFile(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'esnext',
          target: 'esnext',
          moduleResolution: 'bundler',
          baseUrl: '.',
          paths: {
            '2g': ['./vendor/2g/index.ts'],
          },
        },
        files: ['events.ts', 'vendor/2g/index.ts'],
      })
    );

    try {
      const output = generateEventRegistryTypes({
        project: path.join(dir, 'tsconfig.json'),
        format: 'json',
      });
      expect(JSON.parse(output)).toContainEqual(
        expect.objectContaining({
          key: 'test:done',
          fields: { count: 'number', label: 'string | undefined' },
          optionalFields: ['label'],
        })
      );
      expect(
        generateEventRegistryTypes({
          project: path.join(dir, 'tsconfig.json'),
          format: 'dts',
        })
      ).toContain('"label"?: string | undefined;');
      await fs.writeFile(
        path.join(dir, 'events.ts'),
        `import '2g'; declare module '2g' {
          interface EventRegistry { ${JSON.stringify('test:say"hello')}: {} }
        }`
      );
      for (const format of ['json', 'dts'] as const) {
        expect(() =>
          generateEventRegistryTypes({
            project: path.join(dir, 'tsconfig.json'),
            format,
          })
        ).toThrow('Invalid event name');
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsupported CLI formats', () => {
    expect(() => runTypegenCli(['--format', 'yaml'])).toThrow(
      'Unsupported format: yaml'
    );
  });

  it('supports --json as a CLI alias for JSON output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-typegen-'));
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    await fs.mkdir(path.join(dir, 'vendor/2g'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'vendor/2g/index.ts'),
      `
        export interface EventRegistry {}
      `
    );
    await fs.writeFile(
      path.join(dir, 'events.ts'),
      `
        import '2g';
        declare module '2g' {
          interface EventRegistry {
            'test:done': { count: number };
          }
        }
      `
    );
    await fs.writeFile(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'esnext',
          target: 'esnext',
          moduleResolution: 'bundler',
          baseUrl: '.',
          paths: {
            '2g': ['./vendor/2g/index.ts'],
          },
        },
        files: ['events.ts', 'vendor/2g/index.ts'],
      })
    );

    try {
      runTypegenCli(['--project', path.join(dir, 'tsconfig.json'), '--json']);
      expect(JSON.parse(String(write.mock.calls[0][0]))).toContainEqual(
        expect.objectContaining({ key: 'test:done' })
      );
    } finally {
      write.mockRestore();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

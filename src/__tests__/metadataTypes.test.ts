import { expect, expectTypeOf, it } from 'vitest';
import {
  installEventLogger,
  updateEventLoggerMetadata,
  type EventLoggerMetadata,
} from '../index';
import type { ListedSession, EventLoggerMetadata as ApiMetadata } from '../api';

declare module '../index' {
  interface MetadataRegistry {
    port: number;
    ready: boolean;
    devServerUrl: string | null;
    configuration: { enabled: boolean; count: number };
    ports: readonly number[];
    endpoint: readonly [string, number];
    invalid: () => void;
    _w: string;
  }
}

function checkMetadataTypes() {
  installEventLogger({ metadata: {} });
  installEventLogger({ metadata: { version: '1', port: 8081 } });
  updateEventLoggerMetadata({ ready: false });
  updateEventLoggerMetadata({ devServerUrl: null });
  updateEventLoggerMetadata({ configuration: { enabled: true, count: 0 } });
  updateEventLoggerMetadata({
    ports: [8081] as const,
    endpoint: ['localhost', 8081],
  });
  // @ts-expect-error preserve declared tuple shape
  updateEventLoggerMetadata({ endpoint: [8081, 'localhost'] });
  // @ts-expect-error version moved under metadata
  installEventLogger({ version: '1' });
  // @ts-expect-error undeclared key
  updateEventLoggerMetadata({ unknownMetadata: true });
  // @ts-expect-error wrong value
  updateEventLoggerMetadata({ port: '8081' });
  // @ts-expect-error nested objects replace wholesale, not deeply partial
  updateEventLoggerMetadata({ configuration: { enabled: true } });
  // @ts-expect-error version is not nullable
  updateEventLoggerMetadata({ version: null });
  // @ts-expect-error functions are not JSON metadata
  updateEventLoggerMetadata({ invalid: () => {} });
  // @ts-expect-error reserved keys excluded even when declared
  updateEventLoggerMetadata({ _w: 'fake' });
}

it('shares augmented partial metadata with the public listing API', () => {
  expectTypeOf<ApiMetadata>().toEqualTypeOf<EventLoggerMetadata>();
  expectTypeOf<
    Extract<keyof EventLoggerMetadata, 'format'>
  >().toEqualTypeOf<never>();
  expectTypeOf<ListedSession['metadata']['port']>().toEqualTypeOf<
    number | undefined
  >();
  expect(checkMetadataTypes).toBeTypeOf('function');
});

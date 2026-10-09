import type { EventLoggerMetadata, ParsedEvent } from '../../types';
import {
  compileEventFilter,
  matchesTapOptions,
  parseSince,
  type EventFilterOptions,
} from '../../utils/eventFilter';

export interface ExportOptions extends EventFilterOptions {
  processName?: string;
  command?: string;
  pid?: number;
}

export class ExportContext {
  version?: string;
  #filter: ReturnType<typeof compileEventFilter>;
  #eventOptions: Omit<EventFilterOptions, 'since'> & { since?: number };

  constructor(private readonly options: ExportOptions) {
    this.#filter = compileEventFilter(options.filter);
    this.#eventOptions = { ...options, since: parseSince(options.since) };
  }

  get processName() {
    if (this.options.processName != null) return this.options.processName;
    const version = this.version;
    if (this.options.command != null) {
      return `${this.options.command} (${version ? `v${version}, ` : ''}PID ${this.options.pid})`;
    }
    return version ? `2g (v${version})` : '2g';
  }

  read(event: ParsedEvent): ParsedEvent | undefined {
    const patch =
      event._e === 'root:init' || event._e === 'root:metadata'
        ? (event.metadata as EventLoggerMetadata | undefined)
        : undefined;
    if (!event._w && patch && Object.hasOwn(patch, 'version'))
      this.version =
        typeof patch.version === 'string' ? patch.version : undefined;
    if (!matchesTapOptions(event, this.#eventOptions, this.#filter)) return;
    if (event._e === 'root:init' && patch && Object.keys(patch).length) {
      return {
        _e: 'root:metadata',
        _t: event._t,
        _w: event._w,
        metadata: patch,
      };
    }
    return event;
  }
}

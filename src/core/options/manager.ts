import { Signal } from '@preact/signals';
import { isEqual, safeJSONParse } from '@/utils/common';
import logger from '@/utils/logger';
import packageJson from '@/../package.json';

/**
 * Type for global app options.
 */
export interface AppOptions {
  theme?: string;
  debug?: boolean;
  showControlPanel?: boolean;
  disabledExtensions?: string[];
  dateTimeFormat?: string;
  filenamePattern?: string;
  language?: string;
  dedicatedDbForAccounts?: boolean;
  version?: string;
}

export const DEFAULT_APP_OPTIONS: AppOptions = {
  theme: 'system',
  debug: false,
  showControlPanel: true,
  disabledExtensions: [
    'HomeTimelineModule',
    'ListTimelineModule',
    'ListSubscribersModule',
    'ListMembersModule',
    'CommunityMembersModule',
    'CommunityTimelineModule',
    'RetweetersModule',
    'RuntimeLogsModule',
  ],
  dateTimeFormat: 'YYYY-MM-DD HH:mm:ss Z',
  filenamePattern: '{screen_name}_{id}_{type}_{num}_{date}.{ext}',
  language: '',
  dedicatedDbForAccounts: false,
  version: packageJson.version,
};

// https://daisyui.com/docs/themes/
export const THEMES = [
  'system',
  'cupcake',
  'dark',
  'emerald',
  'cyberpunk',
  'valentine',
  'lofi',
  'dracula',
  'cmyk',
  'business',
  'winter',
] as const;

const LOCAL_STORAGE_KEY = packageJson.name;
const LEGACY_LOCAL_STORAGE_KEYS = ['twitter-web-exporter'];

/**
 * Persist app options to browser local storage.
 */
export class AppOptionsManager {
  private appOptions: AppOptions = { ...DEFAULT_APP_OPTIONS };
  private previous: AppOptions = { ...DEFAULT_APP_OPTIONS };

  /**
   * Signal for subscribing to option changes.
   */
  public signal = new Signal(0);

  constructor() {
    this.loadAppOptions();
  }

  public get<T extends keyof AppOptions>(key: T, defaultValue?: AppOptions[T]) {
    return this.appOptions[key] ?? defaultValue;
  }

  public set<T extends keyof AppOptions>(key: T, value: AppOptions[T]) {
    this.appOptions[key] = value;
    this.saveAppOptions();
  }

  /**
   * Read app options from local storage.
   */
  private loadAppOptions() {
    let migratedFromLegacy = false;
    const currentRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const parsedCurrent = safeJSONParse(currentRaw || '{}');
    const currentOptions =
      parsedCurrent && typeof parsedCurrent === 'object' ? (parsedCurrent as AppOptions) : {};
    let loadedOptions: AppOptions = currentOptions;
    const looksLikeFreshDefaultOptions =
      !!currentRaw &&
      isEqual(
        currentOptions.disabledExtensions ?? [],
        DEFAULT_APP_OPTIONS.disabledExtensions ?? [],
      ) &&
      currentOptions.version === packageJson.version;

    if (!currentRaw || looksLikeFreshDefaultOptions) {
      for (const legacyKey of LEGACY_LOCAL_STORAGE_KEYS) {
        const legacyRaw = localStorage.getItem(legacyKey);
        if (!legacyRaw) continue;
        const legacyOptions = safeJSONParse(legacyRaw);
        if (legacyOptions && typeof legacyOptions === 'object') {
          loadedOptions = legacyOptions as AppOptions;
          migratedFromLegacy = true;
          logger.info(`App options migrated from legacy storage key: ${legacyKey}`);
          break;
        }
      }
    }

    this.appOptions = {
      ...this.appOptions,
      ...loadedOptions,
    };

    const oldVersion = this.appOptions.version ?? '';
    const newVersion = DEFAULT_APP_OPTIONS.version ?? '';

    // Migrate from v1.0 to v1.1.
    if (newVersion.startsWith('1.1') && oldVersion.startsWith('1.0')) {
      this.appOptions.disabledExtensions = [
        ...(this.appOptions.disabledExtensions ?? []),
        'HomeTimelineModule',
        'ListTimelineModule',
      ];
      logger.info(`App options migrated from v${oldVersion} to v${newVersion}`);
      setTimeout(() => this.saveAppOptions(), 0);
    }

    if (migratedFromLegacy) {
      setTimeout(() => this.saveAppOptions(), 0);
    }

    this.previous = { ...this.appOptions };
    logger.info('App options loaded', this.appOptions);
    this.signal.value++;
  }

  /**
   * Write app options to local storage.
   */
  private saveAppOptions() {
    const oldValue = this.previous;
    const newValue = {
      ...this.appOptions,
      version: packageJson.version,
    };

    if (isEqual(oldValue, newValue)) {
      return;
    }

    this.appOptions = newValue;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.appOptions));

    this.previous = { ...this.appOptions };
    logger.debug('App options saved', this.appOptions);
    this.signal.value++;
  }
}

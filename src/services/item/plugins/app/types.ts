export interface AppsPluginOptions {
  jwtSecret: string;
  /** In minutes. Defaults to 360 (6 hours). */
  jwtExpiration?: number;

  publisherId: string;
}

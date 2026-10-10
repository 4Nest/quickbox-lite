export interface Session {
  user: string | null;
}
export interface Entry {
  name: string;
  path: string;
  directory: boolean;
  symlink: boolean;
  size: number;
  modified: string;
  deletable: boolean;
}
export interface Service {
  key: string;
  name: string;
  unit: string;
  running: boolean;
}
export interface Package {
  package: string;
  name: string;
  description: string;
  installed: boolean;
  installable: boolean;
  services: Service[];
}
export interface Overview {
  hostname: string;
  system: string;
  arch: string;
  uptime: number;
  cpu: { model: string; cores: number; percent: number };
  memory: { total: number; used: number };
  disk: { total: number; used: number; percent: number } | null;
  network: { iface: string; rx: number; tx: number }[];
  config: {
    username: string;
    version: string;
    branch: string;
  };
  menu: {
    installedMenuEntries: { name: string; url: string; logo?: string }[];
    installedDownloadEntries: { name: string; url: string }[];
    showWebConsole: boolean;
  };
}
export interface Operation {
  title: string;
  detail: string;
  command: string;
}

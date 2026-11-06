/** Dados públicos do teste de conexão. Nunca incluir cookies, CSRF ou senha. */
export type SiteConnectionStatus = {
  connected: boolean;
  mode: "read_only";
  siteOrigin: "https://www.brazilhrproject.icu";
  checkedAt?: string;
  expiresAt?: string;
  user?: {
    name: string;
    username: string;
    role: string;
    requiresApproval: boolean;
  };
  catalog?: {
    materialCount: number;
    lotCount: number;
    equipmentCount: number;
  };
};

export type SiteConnectionCredentials = {
  username: string;
  password: string;
};

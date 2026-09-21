export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-insecure-secret",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:8080",
  maxFileBytes: Number(process.env.MAX_FILE_BYTES ?? 25 * 1024 * 1024),
  databaseUrl: process.env.DATABASE_URL ?? "",
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY ?? "",
    fromEmail: process.env.SENDGRID_FROM_EMAIL ?? "",
    fromName: process.env.SENDGRID_FROM_NAME ?? "Ledger",
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "fileshare",
    accessKey: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },
};

export const AUTH_COOKIE = "fs_session";
export const SHARE_UNLOCK_COOKIE = "fs_share_unlock";

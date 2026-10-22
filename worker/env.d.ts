// Optional secret: set with `wrangler secret put ADMIN_PASSWORD` to skip the first-run claim.
interface Env {
  ADMIN_PASSWORD?: string;
}

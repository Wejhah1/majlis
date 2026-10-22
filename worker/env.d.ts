// Optional secret: set with `wrangler secret put ADMIN_PASSWORD` to skip the first-run claim.
interface Env {
  ADMIN_PASSWORD?: string;
  /** Optional R2 bucket for photos; without it they are stored in D1. */
  MEDIA?: R2Bucket;
}

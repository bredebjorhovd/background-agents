output "bucket_name" {
  description = "The name of the R2 bucket"
  value       = cloudflare_r2_bucket.this.name
}

output "bucket_id" {
  description = "The ID of the R2 bucket (same as name for R2)"
  value       = cloudflare_r2_bucket.this.id
}

# Cloudflare R2 Bucket Module
# Creates an R2 bucket for application data (e.g. session artifacts / screenshots).
# Do not use for Terraform state; that uses a separate bucket (see backend.tf).

resource "cloudflare_r2_bucket" "this" {
  account_id = var.account_id
  name       = var.bucket_name
  location   = var.location
}

variable "account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "bucket_name" {
  description = "Name of the R2 bucket"
  type        = string
}

variable "location" {
  description = "R2 bucket location hint (e.g. WEUR, ENAM). Optional; provider default if not set."
  type        = string
  default     = "ENAM"
}

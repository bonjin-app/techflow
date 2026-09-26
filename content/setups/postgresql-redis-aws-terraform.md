---
id: postgresql-redis-aws-terraform
name: PostgreSQL + Redis (Valkey) on AWS with Terraform
tagline: Amazon RDS for PostgreSQL and ElastiCache (Valkey) in private subnets, encrypted, as code
environment: managed
difficulty: 4
tags: [AWS, Managed Services, Infrastructure as Code, Database, Cache]
components:
  - { ref: terraform, version: "1.9+ with AWS provider 6.x", role: "Declares both services, their network access and their secrets" }
  - { ref: postgresql, version: "17 on Amazon RDS", role: "Multi-AZ primary with automated backups; the password lives in Secrets Manager" }
  - { ref: redis, version: "Valkey 8.2 on ElastiCache", role: "Redis-compatible cache with a replica and automatic failover, TLS on the wire" }
related:
  - { to: redis-postgresql-docker-compose, rel: RELATED_TO }
  - { to: cloud-platform, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: cache-aside, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-26, confidence: medium }
---

## TL;DR

The Redis + PostgreSQL pairing from the local guide, moved to managed AWS services and
described in [Terraform](/technology/terraform): Amazon RDS runs
[PostgreSQL](/technology/postgresql) 17 across two availability zones with daily backups,
and Amazon ElastiCache runs a Redis-compatible cache with a replica that takes over if the
primary fails. Neither is reachable from the internet — only from the application's security
group — both encrypt at rest and in transit, and no password appears in the code: RDS keeps
it in Secrets Manager.

## Why this pairing

**The application code does not change; the operations do.** The same `pg` and `redis`
clients connect to these endpoints as to local containers. What moves to AWS is the work
that is hardest to do well yourself: backups and point-in-time recovery, failover, patching,
and replacing a failed disk at 3 a.m.

**What fits:**

- ElastiCache offers **Valkey**, the open-source fork created in 2024 when Redis changed its
  licence. It speaks the same protocol, so Redis clients and commands work unchanged; the
  Redis OSS engine is also available, up to the 7.x line.
- RDS can generate and store the master password in Secrets Manager
  (`manage_master_user_password`), so it never passes through Terraform state or a
  developer's shell.
- Both services live in the same VPC as the application and are addressed by DNS names that
  survive failover.

**Where it rubs:**

- Everything costs money while it runs, including the standby. A Multi-AZ database and a
  two-node cache are several times the price of the containers they replace.
- TLS is required end to end, so clients need the right URL scheme (`rediss://`) and, for
  PostgreSQL, the RDS certificate bundle to verify the server.
- Some changes are disruptive. Instance class and major version changes restart the
  database; plan them in a maintenance window rather than applying them on a whim.

## Set it up

```steps
title: From a VPC to two private, encrypted services
Inputs | The VPC, its private subnets and the application's security group already exist
Network access | One security group per service, open only to the application
PostgreSQL on RDS | Multi-AZ, encrypted, backed up, password managed in Secrets Manager
Cache on ElastiCache | Valkey with a replica, automatic failover, TLS and encryption at rest
Connect | Read the secret at start-up; verify the database certificate
```

**1. `variables.tf` and the provider**

```hcl
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
```

**2. `network.tf`** — each service accepts connections from the application's security
group and nothing else.

```hcl
resource "aws_security_group" "db" {
  name   = "app-db"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

resource "aws_security_group" "cache" {
  name   = "app-cache"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

resource "aws_db_subnet_group" "db" {
  name       = "app-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_subnet_group" "cache" {
  name       = "app-cache"
  subnet_ids = var.private_subnet_ids
}
```

**3. `database.tf`**

```hcl
resource "aws_db_instance" "main" {
  identifier                  = "app"
  engine                      = "postgres"
  engine_version              = "17"
  instance_class              = "db.t4g.medium"
  allocated_storage           = 50
  db_name                     = "app"
  username                    = "app"
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  multi_az                     = true
  storage_encrypted            = true
  backup_retention_period      = 7
  performance_insights_enabled = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "app-final"
}
```

**4. `cache.tf`**

```hcl
resource "aws_elasticache_replication_group" "cache" {
  replication_group_id = "app-cache"
  description          = "Application cache"
  engine               = "valkey"
  engine_version       = "8.2"
  node_type            = "cache.t4g.small"
  num_cache_clusters   = 2

  automatic_failover_enabled = true
  multi_az_enabled           = true
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true

  subnet_group_name  = aws_elasticache_subnet_group.cache.name
  security_group_ids = [aws_security_group.cache.id]
}

output "db_address" { value = aws_db_instance.main.address }
output "db_secret_arn" { value = aws_db_instance.main.master_user_secret[0].secret_arn }
output "cache_address" { value = aws_elasticache_replication_group.cache.primary_endpoint_address }
```

```sh
terraform init
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

**5. Connecting from the application.** The secret holds `username` and `password`; the
database certificate is verified against the RDS bundle, downloaded into the image.

```js
import fs from "node:fs";
import pg from "pg";
import { createClient } from "redis";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secrets = new SecretsManagerClient({});
const { SecretString } = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
const { username, password } = JSON.parse(SecretString);

export const pool = new pg.Pool({
  host: process.env.DB_ADDRESS,
  database: "app",
  user: username,
  password,
  ssl: { ca: fs.readFileSync("global-bundle.pem", "utf8"), rejectUnauthorized: true },
  max: 10,
});

export const cache = await createClient({ url: `rediss://${process.env.CACHE_ADDRESS}:6379` })
  .on("error", (err) => console.error("cache", err))
  .connect();
```

```sh
curl -fsSLo global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

## Verify

From a machine inside the VPC — a bastion, or a task in the application's security group —
both services answer, and only over TLS:

```sh
terraform output -raw db_address
aws rds describe-db-instances --db-instance-identifier app \
  --query "DBInstances[0].[DBInstanceStatus,MultiAZ,StorageEncrypted]"      # available, true, true

psql "host=$(terraform output -raw db_address) dbname=app user=app sslmode=verify-full sslrootcert=global-bundle.pem" -c "SELECT version()"

redis-cli --tls -h "$(terraform output -raw cache_address)" -p 6379 PING      # PONG
```

The same commands from outside the VPC should time out: that is the security groups and
`publicly_accessible = false` doing their job.

## Going to production

- **Keep Terraform state remote and locked** — an S3 backend with locking — and never
  commit it; it contains resource details even though the password is not in it.
- **Rotate the database secret.** Secrets Manager can rotate the RDS-managed password on a
  schedule; applications that read it at start-up need to reconnect with the new value, so
  test rotation before relying on it.
- **Add authentication to the cache.** TLS protects the wire; access control is separate —
  ElastiCache supports user groups (RBAC) or an AUTH token with transit encryption on.
- **Watch the numbers that precede outages:** RDS free storage, CPU credit balance on `t4g`
  classes, connection count against `max_connections`; ElastiCache memory, evictions and
  replication lag.
- **Right-size after a week of real traffic.** Burstable classes are a sensible start and a
  poor steady state for a busy database.
- **Test the failover.** Rebooting the RDS instance with failover, and triggering an
  ElastiCache failover, shows whether the application reconnects on its own — see
  [Replication](/concept/replication).

## When not to

- **Early prototypes and side projects.** Two containers on one server cost a fraction of
  this and are enough until the data matters.
- **Heavy, spiky or globally distributed workloads.** Aurora, serverless tiers or a
  multi-region design change the answer; this is the plain, single-region baseline.
- **The organisation standardises on another cloud or on-premises.** The pairing carries
  over — Cloud SQL and Memorystore, or self-managed replicas — but none of this Terraform
  does.

## References

- [Terraform AWS provider: `aws_db_instance`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance)
- [Terraform AWS provider: `aws_elasticache_replication_group`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_replication_group)
- [Amazon RDS: password management with Secrets Manager](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)
- [Amazon RDS: SSL/TLS and the certificate bundle](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html)
- [Amazon RDS for PostgreSQL: supported versions](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html)
- [Amazon ElastiCache: supported engines and versions](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/engine-versions.html)
- [Amazon ElastiCache: in-transit encryption](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html)

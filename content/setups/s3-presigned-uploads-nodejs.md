---
id: s3-presigned-uploads-nodejs
name: Direct browser uploads to S3 with presigned POST
tagline: The API signs a short, size-limited upload; the browser sends the file straight to S3
environment: managed
difficulty: 3
verification: static
validates: signed upload policy
tags: [AWS, Object Storage, Uploads, Security]
components:
  - { ref: s3, version: "Amazon S3", role: "Receives the file directly, enforces the signed policy, keeps the bucket private" }
  - { ref: nodejs, version: "22 LTS with AWS SDK v3", role: "Authorises the upload and signs a POST policy with @aws-sdk/s3-presigned-post" }
related:
  - { to: file-storage-service, rel: RELATED_TO }
  - { to: cors, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-27, confidence: medium }
---

## TL;DR

Uploads should not pass through your API. With a presigned POST, the
[Node.js](/technology/nodejs) API checks who the user is and what they may upload, then signs
a policy — this bucket, this key, at most 10 MB, images only, valid for five minutes — and
the browser sends the file straight to [S3](/technology/s3). The API handles a small JSON
request instead of a multi-megabyte stream, and S3 rejects anything outside the policy
before it is stored. The bucket stays private; nothing is public to make this work.

## Why this pairing

**S3 enforces the rules you sign.** A presigned request carries your credentials' authority,
limited to exactly what the signature covers. Your server decides; S3 checks. That removes
upload bandwidth, memory and slow clients from the application servers entirely.

**What fits:**

- A POST policy can require a key prefix, a content type and a **size range** — a presigned
  `PUT` URL can pin an exact length at best, not a range, which is why this guide uses POST.
- The AWS SDK v3 signs locally with no network call, so issuing an upload costs
  milliseconds.
- The object key is chosen by the server, so users cannot overwrite each other's files or
  pick paths.

**Where it rubs:**

- The browser talks to S3 directly, so the bucket needs a CORS rule for your origin — the
  most common reason a first attempt fails in the browser but works with `curl`.
- The API does not see the upload finish. Recording it needs either a call from the client
  afterwards or an S3 event notification.
- Presigned requests are bearer tokens: anyone holding one can use it until it expires, so
  keep expiry short and keys unguessable.

## Set it up

```steps
title: From a private bucket to a browser upload
Bucket | Private, with Block Public Access on and a CORS rule for your site's origin
Credentials | The API's role may put objects under one prefix, and nothing else
Sign | Authorise the user, choose the key, sign a POST policy with size and type limits
Upload | The browser posts the returned fields and the file to the returned URL
```

**1. Bucket and CORS** — new buckets block public access by default; keep it that way.
`cors.json`:

```json file=cors.json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.example.com"],
      "AllowedMethods": ["POST"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

```sh
aws s3api create-bucket --bucket example-uploads --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1
aws s3api put-bucket-cors --bucket example-uploads --cors-configuration file://cors.json
```

**2. The API's permissions** — the role the Node.js service runs as can only write under
`uploads/`:

```json file=iam-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::example-uploads/uploads/*"
    }
  ]
}
```

**3. The signing endpoint** — the server picks the key; the policy caps size and type.

```js file=signer.js
import crypto from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const s3 = new S3Client({ region: "eu-west-1" });
const MAX_BYTES = 10 * 1024 * 1024;

export async function signUpload(userId, contentType) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error("unsupported type");
  }
  const key = `uploads/${userId}/${crypto.randomUUID()}`;
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: "example-uploads",
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: 300,
  });
  return { url, fields, key };
}
```

**4. In the browser** — every returned field goes into the form, and the file goes last.

```js file=upload.js
async function upload(file) {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type }),
  });
  const { url, fields, key } = await res.json();

  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append("file", file); // must be the last field

  const put = await fetch(url, { method: "POST", body: form });
  if (!put.ok) throw new Error(`upload rejected: ${put.status}`);
  return key;
}
```

```sh
npm install @aws-sdk/client-s3 @aws-sdk/s3-presigned-post
```

```json file=package.json hidden
{ "type": "module", "dependencies": { "@aws-sdk/client-s3": "^3", "@aws-sdk/s3-presigned-post": "^3" } }
```

```sh run hidden
npm install --no-audit --no-fund
```

```js file=policy-check.mjs hidden
// Calls the guide's own signing code — offline, with placeholder credentials — and reads back what it signed.
import assert from "node:assert/strict";
import fs from "node:fs";
import { signUpload } from "./signer.js";

const decode = (fields) => JSON.parse(Buffer.from(fields.Policy, "base64").toString("utf8"));
const png = await signUpload("user-7", "image/png");
const policy = decode(png.fields);
const has = (cond) => policy.conditions.some((c) => JSON.stringify(c) === JSON.stringify(cond));

// What the guide says it signs: this bucket, a server-chosen key, 1 B to 10 MB, only the signed type
assert(has({ bucket: "example-uploads" }), "bucket is pinned");
assert(has({ key: png.key }), "the key is the one the server chose");
assert(has(["content-length-range", 1, 10 * 1024 * 1024]), "size is capped at 10 MB");
assert(has(["eq", "$Content-Type", "image/png"]), "the content type is the signed one");
assert.match(png.key, /^uploads\/user-7\/[0-9a-f-]{36}$/, "the key sits under the user and cannot be chosen by the client");
assert.notEqual(png.key, (await signUpload("user-7", "image/png")).key, "every upload gets a new key");

// Five minutes, as the guide says
const lifetime = (Date.parse(policy.expiration) - Date.now()) / 1000;
assert(lifetime > 240 && lifetime <= 300, `expires in ${Math.round(lifetime)}s`);

// The form the browser must submit is complete, and the signature is there to be checked
for (const f of ["Policy", "X-Amz-Signature", "X-Amz-Credential", "X-Amz-Algorithm", "Content-Type", "key"]) assert(png.fields[f], `field ${f}`);
assert.match(png.url, /example-uploads/, "posts to the bucket");

// Anything else is refused before it is signed
await assert.rejects(() => signUpload("user-7", "text/html"), /unsupported type/);
await assert.rejects(() => signUpload("user-7", "application/x-sh"), /unsupported type/);

// The IAM policy lets the API write exactly the prefix the signer uses, and nothing else
const iam = JSON.parse(fs.readFileSync("iam-policy.json", "utf8"));
const [stmt] = iam.Statement;
assert.equal(iam.Statement.length, 1);
assert.equal(stmt.Effect, "Allow");
assert.equal(stmt.Action, "s3:PutObject");
assert(png.key.startsWith(stmt.Resource.replace("arn:aws:s3:::example-uploads/", "").replace("*", "")), "the signer's keys fall under the granted prefix");

// CORS lets the browser's POST through from the site's origin only
const [rule] = JSON.parse(fs.readFileSync("cors.json", "utf8")).CORSRules;
assert.deepEqual(rule.AllowedMethods, ["POST"]);
assert(!rule.AllowedOrigins.includes("*"), "no wildcard origin");

console.log("signed policy ok:", JSON.stringify(policy.conditions));
```

## Verify

An upload inside the policy succeeds, and the object is private:

```sh
aws s3api head-object --bucket example-uploads --key uploads/<user>/<uuid>   # ContentType image/png
curl -s -o /dev/null -w "%{http_code}\n" https://example-uploads.s3.eu-west-1.amazonaws.com/uploads/<user>/<uuid>   # 403
```

```sh check hidden
export AWS_ACCESS_KEY_ID=placeholder AWS_SECRET_ACCESS_KEY=placeholder AWS_REGION=eu-west-1
node policy-check.mjs
# the browser snippet is syntactically sound, and does what the guide says: every field, then the file last
node --check upload.js
grep -q 'form.append("file", file)' upload.js
file_line=$(grep -n 'form.append("file"' upload.js | cut -d: -f1)
fields_line=$(grep -n 'form.append(name, value)' upload.js | cut -d: -f1)
[ "$fields_line" -lt "$file_line" ]
```

Uploads outside the policy are refused by S3 itself, before anything is stored:

- a file over 10 MB — `EntityTooLarge`
- a different `Content-Type` than the one signed — `AccessDenied`, the policy condition failed
- the same form after five minutes — `AccessDenied`, the policy has expired

If the browser reports a CORS error while `curl` succeeds, the bucket's CORS rule does not
list the page's exact origin.

## Going to production

- **Record completion from S3, not the browser.** An S3 event notification to a queue lets a
  worker register the upload, scan it and create thumbnails — see
  [Message Queue](/concept/message-queue) — even if the user closed the tab.
- **Serve through a CDN with signed access**, not public objects; the bucket stays private
  and the CDN is the only reader — see [CDN](/concept/cdn).
- **Expire abandoned uploads.** A lifecycle rule deleting unconfirmed objects under a
  `pending/` prefix after a day keeps storage from filling with files nobody finished.
- **Use multipart uploads for large files.** Beyond a few hundred megabytes, sign the parts
  of a multipart upload so a failed connection resumes instead of restarting.
- **Rate-limit the signing endpoint** per user; it is the one place that decides how much
  anyone may upload.

## When not to

- **The server must inspect or transform the bytes during the upload** — for example
  streaming transcoding. Then the bytes have to reach your code, and the question becomes
  how to scale that path.
- **Files are tiny and rare.** A few kilobytes through the API is simpler than a CORS rule, a
  signing endpoint and a two-step client.
- **The storage is not S3-compatible.** The same pattern exists on other clouds under other
  names; this code and policy do not carry over unchanged.

## References

- [Amazon S3: uploading objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Amazon S3: POST policy conditions, including `content-length-range`](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html)
- [Amazon S3: CORS configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
- [Amazon S3: Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [AWS CLI: `put-bucket-cors`](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-cors.html)
- [AWS SDK for JavaScript v3: `@aws-sdk/s3-presigned-post`](https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-presigned-post)

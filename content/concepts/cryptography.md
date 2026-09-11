---
id: cryptography
name: Cryptography Basics
tagline: Five primitives, a dozen rules, and the knowledge that key management is the hard part
category: security
tags: [Security, Cryptography, Encryption, Hashing]
difficulty: 3
prerequisites: [programming-fundamentals, http]
learningPath:
  - http
  - cryptography
  - tls
  - https
  - authentication
  - secrets-management
related:
  - { to: tls, rel: RELATED_TO }
  - { to: https, rel: RELATED_TO }
  - { to: jwt, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: secrets-management, rel: RELATED_TO }
  - { to: vault, rel: USED_WITH }
  - { to: owasp-top-10, rel: RELATED_TO }
  - { to: authentication-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Applied cryptography is five primitives and the discipline to use them as intended. A
**hash** proves integrity. A **MAC** proves integrity *and* origin with a shared key. A
**symmetric cipher** (always in an authenticated mode) gives confidentiality. **Asymmetric**
keys give signatures and key exchange without a shared secret. A **password hash** (argon2,
bcrypt, scrypt) is deliberately slow, which is the opposite of what you want everywhere
else. You will almost never implement any of them: you will call a library's high-level API
and then spend your real effort on keys — where they live, who can read them, and how they
rotate. That last part is what actually fails.

## Why it matters

Cryptography fails silently and completely. A system with a nonce reused across two
messages, or a MAC compared with `==`, or AES in ECB mode, produces output that looks
exactly as random as a correct implementation. There is no test that goes red, no latency
spike, no error log. The first signal is a disclosure.

The second reason is that the primitives are commonly used for the wrong job. Encryption is
applied where a signature was needed, so anyone with the key can forge. A fast hash is used
for passwords, so a leaked table is cracked at billions of guesses per second. Data is
encrypted at rest with a key stored next to it, which protects against a stolen disk and
nothing else. In each case the box labelled "encryption" is ticked and the property anyone
wanted is absent.

And it is worth being clear about the limits: cryptography protects data in transit and at
rest against someone who does not have the key. It does nothing about an application that
authorises the wrong user, a compromised server that holds the key in memory, or an insider
who can ask your API nicely. Most breaches do not involve breaking cryptography; they involve
walking around it.

## Visual

```steps
title: Which primitive answers which question
"Has this been altered?" | a hash (SHA-256) — integrity only, and anyone can recompute it
"Was this sent by someone with the key?" | an HMAC — integrity plus authenticity, symmetric
"Only the recipient may read this" | AEAD symmetric encryption (AES-GCM, ChaCha20-Poly1305)
"Anyone may verify, only I may sign" | an asymmetric signature (Ed25519, RSA-PSS)
"Agree on a key over a hostile network" | key exchange (ECDH) — the heart of [TLS](/concept/tls)
"Store a user's password" | a slow password hash with a per-user salt (argon2id, bcrypt)
"Derive a key from a password" | a KDF (argon2, PBKDF2) — not a plain hash
"Protect many records with one master key" | envelope encryption: a data key per record, wrapped by a KMS key
"Prove a token has not been tampered with" | a signature or MAC over the payload — see [JWT](/concept/jwt)
"Generate a token or a nonce" | a cryptographically secure random source, never a plain PRNG
```

## Solutions

**Use a high-level library and its defaults.** libsodium, Tink, the platform's own crypto
API, or your language's `secrets`/`crypto` module. These expose "encrypt this with this key"
rather than a cipher, a mode, a padding scheme and an IV — which is precisely the set of
choices that produce vulnerabilities. If an API asks you to pick a mode, you are at the
wrong level of abstraction.

**Always use authenticated encryption.** AES-GCM or ChaCha20-Poly1305 encrypt *and*
authenticate, so tampering is detected on decryption. Unauthenticated modes (CBC alone, CTR
alone) allow an attacker to modify ciphertext in meaningful ways, and ECB leaks structure so
visibly that its failure is a well-known picture. Include context — a record id, a tenant, a
version — as associated data so a ciphertext cannot be moved from one place to another.

**Never reuse a nonce with the same key.** In GCM this is catastrophic, not degraded: it can
expose the authentication key. Use a random 96-bit nonce per message or a strict counter, and
store it alongside the ciphertext. If you are rotating keys frequently enough that counters
are hard, that is a good problem to have.

**Hash passwords with something slow, and nothing else.** argon2id is the current default;
bcrypt and scrypt remain fine. Each gets a per-user salt automatically, and the cost
parameters should be tuned to the slowest hardware you must support. SHA-256 for a password
is a vulnerability, even salted, because its speed is the attacker's advantage.

**Compare secrets in constant time.** A byte-by-byte comparison that returns early leaks the
correct value through timing. Every library provides a constant-time compare for exactly this
— use it for MACs, tokens, and any equality check on a secret.

**Get randomness from the operating system.** A CSPRNG (`/dev/urandom`, `crypto.randomBytes`,
`secrets.token_bytes`) for anything security-relevant: session ids, tokens, nonces, salts,
reset links. A language's default `random()` is seeded predictably and is for simulations.

**Put keys where the application cannot leak them.** A managed KMS or [Vault](/technology/vault),
with the application holding a short-lived credential to request decryption rather than
holding the key. Envelope encryption — a per-record data key wrapped by a master key — is the
standard shape, because it makes rotation of the master key cheap and limits what one leaked
data key exposes. See [Secrets Management](/concept/secrets-management).

## Deep Dive

**Encryption at rest protects against a narrow threat.** Full-disk or database-level
encryption defends against someone taking the disk or the backup. It does not defend against
a compromised application, a SQL injection, or an over-broad role — in all of those, the
data is decrypted for the attacker by the same system that decrypts it for you.
Application-level or field-level encryption narrows the exposure further, at the cost of
losing the ability to index, search or sort those fields, which is a real product constraint
and the reason it is usually reserved for the few fields that warrant it.

**Key rotation is a design requirement, not an operation.** Every ciphertext should record
which key version produced it, so a new key can be introduced without rewriting history and
old data stays readable while it is re-encrypted lazily. A system that cannot rotate keys has
a key that will eventually be compromised and cannot be replaced — and by then the change is
a migration of everything.

**Signatures and MACs are not interchangeable.** A MAC is symmetric: anyone who can verify
can also forge, which is fine inside one service and wrong across a trust boundary. A
signature is asymmetric: the verifier cannot produce one. This is exactly the distinction
that matters in [JWT](/concept/jwt) — an HMAC-signed token shared with a third party gives
them the ability to mint tokens, so cross-boundary tokens want asymmetric signing and
strict algorithm validation on the verifying side.

**TLS is the primitive set assembled correctly.** [TLS](/concept/tls) does key exchange to
agree a session key, certificates to bind an identity to a public key, authenticated
encryption for the data, and a MAC-like transcript check to detect tampering with the
handshake. Understanding that decomposition is why "we encrypt the payload ourselves so we
don't need HTTPS" is wrong: you would be rebuilding the handshake, the identity binding and
the replay protection, badly.

**Hashing is not anonymisation.** Hashing an email address or a phone number produces a value
that can be recovered by hashing every plausible input — the input space is small. For
pseudonymisation you need a keyed construction (an HMAC with a secret key) and a plan for
what happens when that key leaks. Under most data-protection regimes a reversible hash is
still personal data.

**Post-quantum is a planning item, not a panic.** A sufficiently large quantum computer would
break the asymmetric key exchange and signatures in use today; symmetric encryption and
hashing are far less affected. Standards for post-quantum key exchange exist and hybrid modes
are being deployed in TLS. The practical action now is inventory — know where you use
asymmetric cryptography and whether you could change the algorithm — not migration.

**The rule that stays true: do not invent.** Not the protocol, not the mode, not the padding,
not the token format, not "we XOR it with a rotating key". Every well-known cryptographic
failure in production software is someone competent assembling primitives in a new way. Use
the boring construction, in the boring mode, from the boring library, and spend your
cleverness on the key management and the authorisation model — where the actual risk lives.

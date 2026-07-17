# CPCV built-in content-filter packs

## Files

- `ja-core-v1.csv`: Japanese starter pack. 39 terms.
- `en-core-v1.csv`: English starter pack. 50 terms.

The packs are manually curated for CPCV classroom use. Public multilingual profanity lists were reviewed only as references. Pack selection, category, severity, matching behavior, and operational policy are CPCV metadata.

The packs contain no political terms. Installation copies entries into an organization dictionary. Administrators can edit, disable, or delete every copied entry.

These packs are not exhaustive. They are initial operational data and require false-positive and false-negative evaluation before broad deployment.

## CSV columns

```text
term,language_code,category,severity,match_mode,fuzzy_enabled,boundary_mode,active
```

Do not rewrite a released pack version in place. Create a new pack ID and version for later revisions.

# Crowdfunding Contract (CosmWasm)

The Rust CosmWasm contract that powers the crowdfunding dApp. See the
[top-level README](../../README.md) for the full project spec and the
frontend / deploy story.

## Build

The deployable wasm is produced by the official CosmWasm optimizer (reproducible builds, no local Rust toolchain needed):

```sh
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source=crowdfunding_cache,target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer-arm64:0.17.0   # use cosmwasm/optimizer:0.17.0 on amd64
```

Output: `artifacts/crowdfunding.wasm` + `artifacts/checksums.txt` (gitignored).

## Tests

If you have a local Rust toolchain installed:

```sh
cargo test              # unit + integration
cargo schema            # regenerate JSON schemas for ExecuteMsg / QueryMsg
```

## Deploy

From the project root: `scripts/.venv/bin/python scripts/deploy.py`.
See [scripts/README.md](../../scripts/README.md) for setup.

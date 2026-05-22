# Scripts

Operational scripts for the contract — written in Python so they're easy to
read and tweak. They use the official Injective Python SDK (`injective-py`).

## One-time setup

```bash
# 1. Create a virtualenv.
python3 -m venv scripts/.venv

# 2. Install dependencies. If pip fails with a coincurve / CMake error,
#    install the build deps first: brew install cmake pkg-config secp256k1
scripts/.venv/bin/pip install -r scripts/requirements.txt

# 3. Make sure .env.local has DEPLOYER_MNEMONIC (and, after deploy,
#    NEXT_PUBLIC_CONTRACT_ADDRESS). See .env.example.
```

## Deploy the contract

```bash
scripts/.venv/bin/python scripts/deploy.py
```

Uploads the wasm at `contract/crowdfunding/artifacts/crowdfunding.wasm`,
instantiates a fresh contract, and prints the new contract address to copy
into `.env.local`.

## End-to-end smoke test

```bash
scripts/.venv/bin/python scripts/smoke.py
```

Creates a campaign, donates 0.1 INJ, and re-reads the state. Use this to
sanity-check a deploy or to validate contract changes before exposing them
to the frontend.

## Shared helper

[`lib.py`](lib.py) contains the boilerplate (mnemonic → wallet, amount
conversion, sign+broadcast, query decoding) so the two main scripts stay
linear and readable.

"""Deploy the crowdfunding contract to Injective Testnet.

Two steps on chain:
    1. MsgStoreCode      — upload the wasm bytes, get back a code_id
    2. MsgInstantiateContract — create an instance at a fresh address

Prereqs:
    - Build the wasm:
        cd contract/crowdfunding
        docker run --rm -v "$(pwd)":/code \\
          --mount type=volume,source=crowdfunding_cache,target=/target \\
          --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \\
          cosmwasm/optimizer-arm64:0.17.0
    - Funded testnet wallet — set DEPLOYER_MNEMONIC in .env.local.
      Get test INJ from https://testnet.faucet.injective.network/

Usage:
    scripts/.venv/bin/python scripts/deploy.py
"""

from __future__ import annotations

import asyncio
import time

from pyinjective.async_client_v2 import AsyncClient
from pyinjective.composer_v2 import Composer
from pyinjective.core.network import Network
from pyinjective.proto.cosmwasm.wasm.v1 import tx_pb2 as wasm_tx_pb2

from lib import (
    PROJECT_ROOT,
    Wallet,
    find_event_attr,
    load_env,
    require_env,
    sign_and_broadcast,
    wallet_from_mnemonic,
)

WASM_PATH = PROJECT_ROOT / "contract" / "crowdfunding" / "artifacts" / "crowdfunding.wasm"


async def store_code(
    client: AsyncClient,
    network: Network,
    wallet: Wallet,
    wasm_bytes: bytes,
) -> int:
    """Upload the wasm and return the new code_id."""
    print(f"[1/2] Storing wasm ({len(wasm_bytes):,} bytes) ...")
    msg = wasm_tx_pb2.MsgStoreCode(sender=wallet.address, wasm_byte_code=wasm_bytes)
    res = await sign_and_broadcast(client, network, wallet, [msg])

    code_id_str = find_event_attr(res, "store_code", "code_id")
    if not code_id_str:
        raise RuntimeError(f"No code_id in tx {res.get('txhash')}: {res}")
    code_id = int(code_id_str)
    print(f"      ok — tx={res['txhash']} code_id={code_id}")
    return code_id


async def instantiate(
    client: AsyncClient,
    network: Network,
    wallet: Wallet,
    composer: Composer,
    code_id: int,
) -> str:
    """Create a new instance of the contract and return its address."""
    print(f"[2/2] Instantiating contract from code_id {code_id} ...")
    msg = composer.msg_instantiate_contract(
        sender=wallet.address,
        admin=wallet.address,
        code_id=code_id,
        label=f"crowdfunding-{int(time.time())}",
        message=b"{}",  # InstantiateMsg is empty for this contract
    )
    res = await sign_and_broadcast(client, network, wallet, [msg])

    addr = find_event_attr(res, "instantiate", "_contract_address")
    if not addr:
        raise RuntimeError(f"No contract address in tx {res.get('txhash')}: {res}")
    print(f"      ok — tx={res['txhash']} address={addr}")
    return addr


async def main() -> None:
    load_env()
    mnemonic = require_env("DEPLOYER_MNEMONIC")
    if not WASM_PATH.exists():
        raise SystemExit(f"Wasm not found at {WASM_PATH}. Build it first (see header).")

    network = Network.testnet()
    client = AsyncClient(network)
    composer = Composer(network=network.string())
    wallet = wallet_from_mnemonic(mnemonic)
    print(f"Deployer: {wallet.address}")

    wasm = WASM_PATH.read_bytes()
    code_id = await store_code(client, network, wallet, wasm)
    contract_address = await instantiate(client, network, wallet, composer, code_id)

    print("\n=== Deployment complete ===")
    print(f"Code ID:          {code_id}")
    print(f"Contract address: {contract_address}")
    print(f"Explorer:         https://testnet.explorer.injective.network/contract/{contract_address}")
    print("\nAdd to .env.local:")
    print(f"NEXT_PUBLIC_CONTRACT_ADDRESS={contract_address}")


if __name__ == "__main__":
    asyncio.run(main())

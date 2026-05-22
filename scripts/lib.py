"""Shared helpers for the deploy + smoke scripts.

Keeps each script linear by hiding the boilerplate of:
  - loading .env.local
  - deriving an Injective wallet from a mnemonic (BIP44 coin type 60)
  - converting between display INJ and base "inj" (18 decimals)
  - building, signing, and broadcasting a transaction
  - decoding the base64-wrapped JSON that CosmWasm queries return
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Sequence

from dotenv import load_dotenv
from google.protobuf.message import Message

from pyinjective.async_client_v2 import AsyncClient
from pyinjective.core.network import Network
from pyinjective.proto.cosmos.base.v1beta1 import coin_pb2
from pyinjective.transaction import Transaction
from pyinjective.wallet import PrivateKey, PublicKey


PROJECT_ROOT = Path(__file__).resolve().parent.parent
INJ_DECIMALS = 18
INJ_DENOM = "inj"


# ---------------------------------------------------------------------------
# Env
# ---------------------------------------------------------------------------

def load_env() -> None:
    """Load .env.local from the project root, then read OS env."""
    load_dotenv(PROJECT_ROOT / ".env.local")


def require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        raise SystemExit(f"Missing env var: {name} (set it in .env.local)")
    return val


# ---------------------------------------------------------------------------
# Wallet
# ---------------------------------------------------------------------------

@dataclass
class Wallet:
    priv: PrivateKey
    pub: PublicKey
    address: str  # bech32 "inj1..."


def wallet_from_mnemonic(mnemonic: str) -> Wallet:
    """Derive the Injective wallet at the standard path m/44'/60'/0'/0/0."""
    priv = PrivateKey.from_mnemonic(mnemonic)
    pub = priv.to_public_key()
    address = pub.to_address().to_acc_bech32()
    return Wallet(priv=priv, pub=pub, address=address)


# ---------------------------------------------------------------------------
# Amount conversion
# ---------------------------------------------------------------------------

def inj_to_base(amount_inj: str | float | int | Decimal) -> str:
    """1.5 INJ -> '1500000000000000000' (18 decimals)."""
    return str(int(Decimal(str(amount_inj)) * (10 ** INJ_DECIMALS)))


def base_to_inj(amount_base: str | int) -> str:
    """'1500000000000000000' -> '1.5'."""
    d = Decimal(str(amount_base)) / (10 ** INJ_DECIMALS)
    # Strip trailing zeros for readability ("1.500" -> "1.5", "0" stays "0").
    return format(d.normalize(), "f")


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

async def query_contract(client: AsyncClient, contract: str, msg: dict[str, Any]) -> Any:
    """Send a smart-contract query and JSON-decode the response.

    fetch_smart_contract_state returns {'data': '<base64-encoded JSON>'},
    so we decode `.data` and parse it.
    """
    resp = await client.fetch_smart_contract_state(contract, json.dumps(msg))
    data_b64: str = resp["data"]
    return json.loads(base64.b64decode(data_b64))


# ---------------------------------------------------------------------------
# Sign + broadcast
# ---------------------------------------------------------------------------

async def sign_and_broadcast(
    client: AsyncClient,
    network: Network,
    wallet: Wallet,
    msgs: Sequence[Message],
    *,
    gas_override: int | None = None,
    gas_price: int = 500_000_000,  # 0.5 Gwei (Injective testnet recommended)
) -> dict[str, Any]:
    """Build, sign, simulate (for gas), and broadcast a transaction.

    Returns the broadcast response dict. Raises if the tx failed.
    """
    # 1. Look up the account's current nonce + account number.
    account = await client.fetch_account(wallet.address)
    account_num = account.base_account.account_number
    sequence = account.base_account.sequence

    tx = (
        Transaction()
        .with_messages(*msgs)
        .with_sequence(sequence)
        .with_account_num(account_num)
        .with_chain_id(network.chain_id)
    )

    # 2. Decide gas. If the caller gave us a number, trust it. Otherwise
    #    simulate the tx and add a 30% buffer.
    if gas_override is not None:
        gas_limit = gas_override
    else:
        gas_limit = await _simulate_gas(client, wallet, tx, gas_price)

    fee_amount = gas_limit * gas_price
    tx = tx.with_gas(gas_limit).with_fee([_inj_coin(fee_amount)])

    # 3. Sign and serialize.
    sign_doc = tx.get_sign_doc(wallet.pub)
    sig = wallet.priv.sign(sign_doc.SerializeToString())
    tx_bytes = tx.get_tx_data(sig, wallet.pub)

    # 4. Broadcast in sync mode (returns when CheckTx passes).
    res = await client.broadcast_tx_sync_mode(tx_bytes)
    check_tx = res.get("txResponse") or res
    code = int(check_tx.get("code", 0))
    if code != 0:
        raise RuntimeError(
            f"tx failed in CheckTx (code={code}): {check_tx.get('rawLog', res)}"
        )

    # 5. Poll until the tx is included in a block (so the sequence is updated
    #    on chain by the time the caller fires off the next tx).
    tx_hash = check_tx["txhash"]
    return await _wait_for_inclusion(client, tx_hash)


async def _wait_for_inclusion(
    client: AsyncClient, tx_hash: str, *, timeout_s: float = 30.0
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            tx = await client.fetch_tx(tx_hash)
        except Exception as e:
            # fetch_tx raises while the tx isn't indexed yet — retry until deadline.
            transient = any(s in str(e).lower() for s in ("not found", "not been indexed"))
            if not transient or time.monotonic() > deadline:
                raise
            await asyncio.sleep(1.0)
            continue

        tx_response = tx.get("txResponse") or tx
        code = int(tx_response.get("code", 0))
        if code != 0:
            raise RuntimeError(
                f"tx failed in DeliverTx (code={code}): {tx_response.get('rawLog', tx)}"
            )
        return tx_response


async def _simulate_gas(
    client: AsyncClient, wallet: Wallet, tx: Transaction, gas_price: int
) -> int:
    """Simulate the tx with a placeholder fee, then add a 30% buffer."""
    placeholder_fee = 1_000_000 * gas_price
    tx_sim = tx.with_gas(1_000_000).with_fee([_inj_coin(placeholder_fee)])

    sign_doc = tx_sim.get_sign_doc(wallet.pub)
    sig = wallet.priv.sign(sign_doc.SerializeToString())
    sim_bytes = tx_sim.get_tx_data(sig, wallet.pub)

    sim = await client.simulate(sim_bytes)
    used = int(sim["gasInfo"]["gasUsed"])
    return int(used * 1.3)


def _inj_coin(amount: int) -> coin_pb2.Coin:
    return coin_pb2.Coin(denom=INJ_DENOM, amount=str(amount))


# ---------------------------------------------------------------------------
# Event helpers
# ---------------------------------------------------------------------------

def find_event_attr(tx_response: dict[str, Any], event_type: str, attr_key: str) -> str | None:
    """Find the value of an attribute on the first matching event in the tx response."""
    for ev in tx_response.get("events", []):
        if ev.get("type") != event_type:
            continue
        for attr in ev.get("attributes", []):
            if attr.get("key") == attr_key:
                return attr.get("value")
    return None

"""End-to-end smoke test against the deployed contract.

Exercises the same msg shapes the frontend will send, so a green run proves
the contract interface matches what the React app expects.

Steps:
    1. Query GetAllCampaigns (before)
    2. CreateCampaign
    3. Query GetAllCampaigns (after) — should include the new one
    4. Donate 0.1 INJ to it
    5. Query GetCampaign — confirm current_amount went up
    6. Query GetContribution — confirm caller's contribution

Usage:
    scripts/.venv/bin/python scripts/smoke.py
"""

from __future__ import annotations

import asyncio
import json
import time

from pyinjective.async_client_v2 import AsyncClient
from pyinjective.composer_v2 import Composer
from pyinjective.core.network import Network
from pyinjective.proto.cosmos.base.v1beta1 import coin_pb2

from lib import (
    INJ_DENOM,
    base_to_inj,
    inj_to_base,
    load_env,
    query_contract,
    require_env,
    sign_and_broadcast,
    wallet_from_mnemonic,
)


async def main() -> None:
    load_env()
    mnemonic = require_env("DEPLOYER_MNEMONIC")
    contract = require_env("NEXT_PUBLIC_CONTRACT_ADDRESS")

    network = Network.testnet()
    client = AsyncClient(network)
    composer = Composer(network=network.string())
    wallet = wallet_from_mnemonic(mnemonic)
    print(f"Sender: {wallet.address}\nContract: {contract}\n")

    # [1] List campaigns before --------------------------------------------
    print("[1] GetAllCampaigns (before):")
    before = await query_contract(
        client, contract, {"get_all_campaigns": {"start_after": None, "limit": 30}}
    )
    print(f"    {len(before['campaigns'])} existing campaign(s)\n")

    # [2] Create a new campaign -------------------------------------------
    print("[2] CreateCampaign (goal=0.5 INJ, deadline=1h):")
    create_msg = composer.msg_execute_contract(
        sender=wallet.address,
        contract=contract,
        msg=json.dumps({
            "create_campaign": {
                "title": "Smoke test",
                "description": "Validating contract msg shapes from Python",
                "goal": inj_to_base("0.5"),
                "deadline": int(time.time()) + 60 * 60,  # 1 hour from now
            }
        }),
    )
    res = await sign_and_broadcast(client, network, wallet, [create_msg])
    print(f"    tx={res['txhash']}\n")

    # [3] List campaigns after --------------------------------------------
    print("[3] GetAllCampaigns (after):")
    after = await query_contract(
        client, contract, {"get_all_campaigns": {"start_after": None, "limit": 30}}
    )
    new_campaign = after["campaigns"][-1]
    campaign_id = new_campaign["id"]
    print(f"    {len(after['campaigns'])} campaign(s); new id={campaign_id} status={new_campaign['status']}\n")

    # [4] Donate -----------------------------------------------------------
    print(f"[4] Donate 0.1 INJ to campaign {campaign_id}:")
    donate_msg = composer.msg_execute_contract(
        sender=wallet.address,
        contract=contract,
        msg=json.dumps({"donate": {"campaign_id": campaign_id}}),
        funds=[coin_pb2.Coin(denom=INJ_DENOM, amount=inj_to_base("0.1"))],
    )
    res = await sign_and_broadcast(client, network, wallet, [donate_msg])
    print(f"    tx={res['txhash']}\n")

    # [5] Re-fetch the campaign -------------------------------------------
    print(f"[5] GetCampaign({campaign_id}):")
    c = await query_contract(client, contract, {"get_campaign": {"campaign_id": campaign_id}})
    print(f"    raised={base_to_inj(c['current_amount'])} INJ  goal={base_to_inj(c['goal'])} INJ  status={c['status']}\n")

    # [6] Per-donor contribution ------------------------------------------
    print(f"[6] GetContribution({campaign_id}, {wallet.address}):")
    contrib = await query_contract(
        client,
        contract,
        {"get_contribution": {"campaign_id": campaign_id, "contributor": wallet.address}},
    )
    print(f"    you contributed {base_to_inj(contrib['amount'])} INJ\n")

    print("All smoke checks passed.")


if __name__ == "__main__":
    asyncio.run(main())

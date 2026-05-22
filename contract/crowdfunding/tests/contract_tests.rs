use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env};
use cosmwasm_std::{coins, from_json, Addr, Timestamp, Uint128};

use crowdfunding::contract::{execute, instantiate, query};
use crowdfunding::msg::{
    CampaignListResponse, CampaignResponse, CampaignStatus, ContributionResponse, ExecuteMsg,
    InstantiateMsg, QueryMsg,
};
use crowdfunding::state::CAMPAIGNS;
use crowdfunding::ContractError;

const INJ_DENOM: &str = "inj";

fn instantiate_contract(
    deps: &mut cosmwasm_std::OwnedDeps<
        cosmwasm_std::testing::MockStorage,
        cosmwasm_std::testing::MockApi,
        cosmwasm_std::testing::MockQuerier,
    >,
    creator: &Addr,
) -> cosmwasm_std::Env {
    let env = mock_env();
    let info = message_info(creator, &[]);
    instantiate(deps.as_mut(), env.clone(), info, InstantiateMsg {}).unwrap();
    env
}

fn create_campaign(
    deps: &mut cosmwasm_std::OwnedDeps<
        cosmwasm_std::testing::MockStorage,
        cosmwasm_std::testing::MockApi,
        cosmwasm_std::testing::MockQuerier,
    >,
    env: cosmwasm_std::Env,
    creator: &Addr,
    goal: Uint128,
    deadline: u64,
) {
    let msg = ExecuteMsg::CreateCampaign {
        title: "Test".to_string(),
        description: "Desc".to_string(),
        goal,
        deadline,
    };
    let info = message_info(creator, &[]);
    execute(deps.as_mut(), env, info, msg).unwrap();
}

#[test]
fn create_and_query_campaign_active() {
    let mut deps = mock_dependencies();
    let creator = deps.api.addr_make("creator");
    let mut env = instantiate_contract(&mut deps, &creator);
    env.block.time = Timestamp::from_seconds(1_000);

    let deadline = env.block.time.seconds() + 100;
    create_campaign(
        &mut deps,
        env.clone(),
        &creator,
        Uint128::new(100),
        deadline,
    );

    let res = query(deps.as_ref(), env, QueryMsg::GetCampaign { campaign_id: 1 }).unwrap();
    let resp: CampaignResponse = from_json(res).unwrap();

    assert_eq!(resp.id, 1);
    assert_eq!(resp.creator, creator.to_string());
    assert!(matches!(resp.status, CampaignStatus::Active));
}

#[test]
fn donate_multiple_times_updates_contribution() {
    let mut deps = mock_dependencies();
    let creator = deps.api.addr_make("creator");
    let donor = deps.api.addr_make("donor");
    let mut env = instantiate_contract(&mut deps, &creator);
    env.block.time = Timestamp::from_seconds(10);

    let deadline = env.block.time.seconds() + 100;
    create_campaign(
        &mut deps,
        env.clone(),
        &creator,
        Uint128::new(200),
        deadline,
    );

    let donate_msg = ExecuteMsg::Donate { campaign_id: 1 };
    execute(
        deps.as_mut(),
        env.clone(),
        message_info(&donor, &coins(100, INJ_DENOM)),
        donate_msg.clone(),
    )
    .unwrap();
    execute(
        deps.as_mut(),
        env.clone(),
        message_info(&donor, &coins(50, INJ_DENOM)),
        donate_msg,
    )
    .unwrap();

    let res = query(
        deps.as_ref(),
        env,
        QueryMsg::GetContribution {
            campaign_id: 1,
            contributor: donor.to_string(),
        },
    )
    .unwrap();
    let resp: ContributionResponse = from_json(res).unwrap();
    assert_eq!(resp.amount, Uint128::new(150));

    let stored = CAMPAIGNS.load(deps.as_ref().storage, 1).unwrap();
    assert_eq!(stored.current_amount, Uint128::new(150));
}

#[test]
fn donate_after_deadline_rejected() {
    let mut deps = mock_dependencies();
    let creator = deps.api.addr_make("creator");
    let donor = deps.api.addr_make("donor");
    let mut env = instantiate_contract(&mut deps, &creator);
    env.block.time = Timestamp::from_seconds(100);

    let deadline = env.block.time.seconds() + 10;
    create_campaign(&mut deps, env.clone(), &creator, Uint128::new(50), deadline);

    env.block.time = Timestamp::from_seconds(deadline + 1);
    let err = execute(
        deps.as_mut(),
        env,
        message_info(&donor, &coins(10, INJ_DENOM)),
        ExecuteMsg::Donate { campaign_id: 1 },
    )
    .unwrap_err();

    assert!(matches!(err, ContractError::DeadlinePassed {}));
}

#[test]
fn claim_after_goal_reached() {
    let mut deps = mock_dependencies();
    let creator = deps.api.addr_make("creator");
    let donor = deps.api.addr_make("donor");
    let other = deps.api.addr_make("other");
    let mut env = instantiate_contract(&mut deps, &creator);
    env.block.time = Timestamp::from_seconds(1_000);

    let deadline = env.block.time.seconds() + 100;
    create_campaign(
        &mut deps,
        env.clone(),
        &creator,
        Uint128::new(100),
        deadline,
    );

    execute(
        deps.as_mut(),
        env.clone(),
        message_info(&donor, &coins(100, INJ_DENOM)),
        ExecuteMsg::Donate { campaign_id: 1 },
    )
    .unwrap();

    env.block.time = Timestamp::from_seconds(deadline + 1);

    let err = execute(
        deps.as_mut(),
        env.clone(),
        message_info(&other, &[]),
        ExecuteMsg::Claim { campaign_id: 1 },
    )
    .unwrap_err();
    assert!(matches!(err, ContractError::Unauthorized {}));

    execute(
        deps.as_mut(),
        env.clone(),
        message_info(&creator, &[]),
        ExecuteMsg::Claim { campaign_id: 1 },
    )
    .unwrap();

    let res = query(deps.as_ref(), env, QueryMsg::GetCampaign { campaign_id: 1 }).unwrap();
    let resp: CampaignResponse = from_json(res).unwrap();
    assert!(resp.claimed);
    assert!(matches!(resp.status, CampaignStatus::Claimed));
}

#[test]
fn refund_after_deadline_when_goal_not_met() {
    let mut deps = mock_dependencies();
    let creator = deps.api.addr_make("creator");
    let donor = deps.api.addr_make("donor");
    let mut env = instantiate_contract(&mut deps, &creator);
    env.block.time = Timestamp::from_seconds(1_000);

    let deadline = env.block.time.seconds() + 50;
    create_campaign(
        &mut deps,
        env.clone(),
        &creator,
        Uint128::new(100),
        deadline,
    );

    execute(
        deps.as_mut(),
        env.clone(),
        message_info(&donor, &coins(40, INJ_DENOM)),
        ExecuteMsg::Donate { campaign_id: 1 },
    )
    .unwrap();

    env.block.time = Timestamp::from_seconds(deadline + 1);
    execute(
        deps.as_mut(),
        env.clone(),
        message_info(&donor, &[]),
        ExecuteMsg::Refund { campaign_id: 1 },
    )
    .unwrap();

    let res = query(
        deps.as_ref(),
        env.clone(),
        QueryMsg::GetContribution {
            campaign_id: 1,
            contributor: donor.to_string(),
        },
    )
    .unwrap();
    let resp: ContributionResponse = from_json(res).unwrap();
    assert!(resp.amount.is_zero());

    let err = execute(
        deps.as_mut(),
        env,
        message_info(&donor, &[]),
        ExecuteMsg::Refund { campaign_id: 1 },
    )
    .unwrap_err();
    assert!(matches!(err, ContractError::NoContribution {}));
}

#[test]
fn pagination_returns_expected_slice() {
    let mut deps = mock_dependencies();
    let creator = deps.api.addr_make("creator");
    let mut env = instantiate_contract(&mut deps, &creator);
    env.block.time = Timestamp::from_seconds(100);

    let deadline = env.block.time.seconds() + 100;
    for _ in 0..3 {
        create_campaign(&mut deps, env.clone(), &creator, Uint128::new(10), deadline);
    }

    let res = query(
        deps.as_ref(),
        env.clone(),
        QueryMsg::GetAllCampaigns {
            start_after: None,
            limit: Some(2),
        },
    )
    .unwrap();
    let resp: CampaignListResponse = from_json(res).unwrap();
    assert_eq!(resp.campaigns.len(), 2);
    assert_eq!(resp.campaigns[0].id, 1);
    assert_eq!(resp.campaigns[1].id, 2);

    let res = query(
        deps.as_ref(),
        env,
        QueryMsg::GetAllCampaigns {
            start_after: Some(2),
            limit: Some(2),
        },
    )
    .unwrap();
    let resp: CampaignListResponse = from_json(res).unwrap();
    assert_eq!(resp.campaigns.len(), 1);
    assert_eq!(resp.campaigns[0].id, 3);
}

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_json_binary, BankMsg, Binary, Coin, Deps, DepsMut, Env, MessageInfo, Order, Response,
    StdError, StdResult, Uint128,
};
use cw2::set_contract_version;
use cw_storage_plus::Bound;

use crate::error::ContractError;
use crate::msg::{
    CampaignListResponse, CampaignResponse, CampaignStatus, ContributionResponse, ExecuteMsg,
    InstantiateMsg, QueryMsg,
};
use crate::state::{Campaign, CAMPAIGNS, CAMPAIGN_SEQ, CONTRIBUTIONS};

const CONTRACT_NAME: &str = "crates.io:crowdfunding";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const INJ_DENOM: &str = "inj";
const DEFAULT_LIMIT: u32 = 10;
const MAX_LIMIT: u32 = 30;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    CAMPAIGN_SEQ.save(deps.storage, &1)?;

    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateCampaign {
            title,
            description,
            goal,
            deadline,
        } => execute_create_campaign(deps, env, info, title, description, goal, deadline),
        ExecuteMsg::Donate { campaign_id } => execute_donate(deps, env, info, campaign_id),
        ExecuteMsg::Claim { campaign_id } => execute_claim(deps, env, info, campaign_id),
        ExecuteMsg::Refund { campaign_id } => execute_refund(deps, env, info, campaign_id),
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetCampaign { campaign_id } => {
            to_json_binary(&query_campaign(deps, env, campaign_id)?)
        }
        QueryMsg::GetContribution {
            campaign_id,
            contributor,
        } => to_json_binary(&query_contribution(deps, campaign_id, contributor)?),
        QueryMsg::GetAllCampaigns { start_after, limit } => {
            to_json_binary(&query_campaigns(deps, env, start_after, limit)?)
        }
    }
}

fn execute_create_campaign(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    title: String,
    description: String,
    goal: Uint128,
    deadline: u64,
) -> Result<Response, ContractError> {
    if goal.is_zero() {
        return Err(ContractError::InvalidGoal {});
    }

    if deadline <= env.block.time.seconds() {
        return Err(ContractError::InvalidDeadline {});
    }

    let id = CAMPAIGN_SEQ.load(deps.storage)?;
    CAMPAIGN_SEQ.save(deps.storage, &(id + 1))?;

    let campaign = Campaign {
        id,
        creator: info.sender.clone(),
        title,
        description,
        goal,
        deadline,
        current_amount: Uint128::zero(),
        claimed: false,
    };

    CAMPAIGNS.save(deps.storage, id, &campaign)?;

    Ok(Response::new()
        .add_attribute("action", "create_campaign")
        .add_attribute("campaign_id", id.to_string())
        .add_attribute("creator", info.sender))
}

fn execute_donate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    campaign_id: u64,
) -> Result<Response, ContractError> {
    let mut campaign = load_campaign(deps.storage, campaign_id)?;

    if campaign.claimed {
        return Err(ContractError::AlreadyClaimed {});
    }

    if env.block.time.seconds() >= campaign.deadline {
        return Err(ContractError::DeadlinePassed {});
    }

    let sent = must_pay_inj(&info)?;

    campaign.current_amount = campaign.current_amount + sent;
    CAMPAIGNS.save(deps.storage, campaign_id, &campaign)?;

    let key = (campaign_id, info.sender.clone());
    let mut donated = CONTRIBUTIONS
        .may_load(deps.storage, key.clone())?
        .unwrap_or_default();
    donated += sent;
    CONTRIBUTIONS.save(deps.storage, key, &donated)?;

    Ok(Response::new()
        .add_attribute("action", "donate")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("donor", info.sender)
        .add_attribute("amount", sent.to_string()))
}

fn execute_claim(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    campaign_id: u64,
) -> Result<Response, ContractError> {
    let mut campaign = load_campaign(deps.storage, campaign_id)?;

    if campaign.creator != info.sender {
        return Err(ContractError::Unauthorized {});
    }

    if campaign.claimed {
        return Err(ContractError::AlreadyClaimed {});
    }

    if env.block.time.seconds() < campaign.deadline {
        return Err(ContractError::DeadlineNotReached {});
    }

    if campaign.current_amount < campaign.goal {
        return Err(ContractError::GoalNotReached {});
    }

    campaign.claimed = true;
    CAMPAIGNS.save(deps.storage, campaign_id, &campaign)?;

    let send = BankMsg::Send {
        to_address: campaign.creator.to_string(),
        amount: vec![Coin::new(campaign.current_amount.u128(), INJ_DENOM)],
    };

    Ok(Response::new()
        .add_message(send)
        .add_attribute("action", "claim")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("creator", info.sender)
        .add_attribute("amount", campaign.current_amount.to_string()))
}

fn execute_refund(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    campaign_id: u64,
) -> Result<Response, ContractError> {
    let mut campaign = load_campaign(deps.storage, campaign_id)?;

    if campaign.claimed {
        return Err(ContractError::RefundNotAvailable {});
    }

    if env.block.time.seconds() < campaign.deadline {
        return Err(ContractError::RefundNotAvailable {});
    }

    if campaign.current_amount >= campaign.goal {
        return Err(ContractError::RefundNotAvailable {});
    }

    let key = (campaign_id, info.sender.clone());
    let amount = CONTRIBUTIONS
        .may_load(deps.storage, key.clone())?
        .unwrap_or_default();

    if amount.is_zero() {
        return Err(ContractError::NoContribution {});
    }

    campaign.current_amount = campaign
        .current_amount
        .checked_sub(amount)
        .map_err(StdError::from)?;
    CAMPAIGNS.save(deps.storage, campaign_id, &campaign)?;
    CONTRIBUTIONS.remove(deps.storage, key);

    let send = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin::new(amount.u128(), INJ_DENOM)],
    };

    Ok(Response::new()
        .add_message(send)
        .add_attribute("action", "refund")
        .add_attribute("campaign_id", campaign_id.to_string())
        .add_attribute("donor", info.sender)
        .add_attribute("amount", amount.to_string()))
}

fn query_campaign(deps: Deps, env: Env, campaign_id: u64) -> StdResult<CampaignResponse> {
    let campaign = CAMPAIGNS.load(deps.storage, campaign_id)?;
    Ok(campaign_to_response(&campaign, &env))
}

fn query_contribution(
    deps: Deps,
    campaign_id: u64,
    contributor: String,
) -> StdResult<ContributionResponse> {
    let addr = deps.api.addr_validate(&contributor)?;
    let amount = CONTRIBUTIONS
        .may_load(deps.storage, (campaign_id, addr))?
        .unwrap_or_default();

    Ok(ContributionResponse { amount })
}

fn query_campaigns(
    deps: Deps,
    env: Env,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<CampaignListResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    let start = start_after.map(Bound::exclusive);

    let campaigns = CAMPAIGNS
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .map(|item| {
            let (_id, campaign) = item?;
            Ok(campaign_to_response(&campaign, &env))
        })
        .collect::<StdResult<Vec<_>>>()?;

    Ok(CampaignListResponse { campaigns })
}

fn campaign_to_response(campaign: &Campaign, env: &Env) -> CampaignResponse {
    CampaignResponse {
        id: campaign.id,
        creator: campaign.creator.to_string(),
        title: campaign.title.clone(),
        description: campaign.description.clone(),
        goal: campaign.goal,
        deadline: campaign.deadline,
        current_amount: campaign.current_amount,
        claimed: campaign.claimed,
        status: compute_status(env, campaign),
    }
}

fn compute_status(env: &Env, campaign: &Campaign) -> CampaignStatus {
    if campaign.claimed {
        return CampaignStatus::Claimed;
    }

    if env.block.time.seconds() >= campaign.deadline && campaign.current_amount < campaign.goal {
        return CampaignStatus::Failed;
    }

    if campaign.current_amount >= campaign.goal {
        return CampaignStatus::GoalReached;
    }

    CampaignStatus::Active
}

fn must_pay_inj(info: &MessageInfo) -> Result<Uint128, ContractError> {
    if info.funds.len() != 1 {
        return Err(ContractError::InvalidFunds {});
    }

    let coin = &info.funds[0];
    if coin.denom != INJ_DENOM {
        return Err(ContractError::InvalidDenom {
            expected: INJ_DENOM.to_string(),
            found: coin.denom.clone(),
        });
    }

    if coin.amount.is_zero() {
        return Err(ContractError::InvalidFunds {});
    }

    Ok(coin.amount)
}

fn load_campaign(
    storage: &mut dyn cosmwasm_std::Storage,
    campaign_id: u64,
) -> Result<Campaign, ContractError> {
    CAMPAIGNS
        .load(storage, campaign_id)
        .map_err(|_| ContractError::CampaignNotFound {})
}

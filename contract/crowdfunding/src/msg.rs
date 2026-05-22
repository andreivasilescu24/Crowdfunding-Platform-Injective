use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

#[cw_serde]
pub struct InstantiateMsg {}

#[cw_serde]
pub enum ExecuteMsg {
    CreateCampaign {
        title: String,
        description: String,
        goal: Uint128,
        deadline: u64,
    },
    Donate {
        campaign_id: u64,
    },
    Claim {
        campaign_id: u64,
    },
    Refund {
        campaign_id: u64,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(CampaignResponse)]
    GetCampaign { campaign_id: u64 },
    #[returns(ContributionResponse)]
    GetContribution {
        campaign_id: u64,
        contributor: String,
    },
    #[returns(CampaignListResponse)]
    GetAllCampaigns {
        start_after: Option<u64>,
        limit: Option<u32>,
    },
}

#[cw_serde]
pub enum CampaignStatus {
    Active,
    GoalReached,
    Failed,
    Claimed,
}

#[cw_serde]
pub struct CampaignResponse {
    pub id: u64,
    pub creator: String,
    pub title: String,
    pub description: String,
    pub goal: Uint128,
    pub deadline: u64,
    pub current_amount: Uint128,
    pub claimed: bool,
    pub status: CampaignStatus,
}

#[cw_serde]
pub struct CampaignListResponse {
    pub campaigns: Vec<CampaignResponse>,
}

#[cw_serde]
pub struct ContributionResponse {
    pub amount: Uint128,
}

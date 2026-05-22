use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::{Item, Map};

#[cw_serde]
pub struct Campaign {
    pub id: u64,
    pub creator: Addr,
    pub title: String,
    pub description: String,
    pub goal: Uint128,
    pub deadline: u64,
    pub current_amount: Uint128,
    pub claimed: bool,
}

pub const CAMPAIGN_SEQ: Item<u64> = Item::new("campaign_seq");
pub const CAMPAIGNS: Map<u64, Campaign> = Map::new("campaigns");
pub const CONTRIBUTIONS: Map<(u64, Addr), Uint128> = Map::new("contributions");

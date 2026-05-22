use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Campaign not found")]
    CampaignNotFound {},

    #[error("Invalid goal amount")]
    InvalidGoal {},

    #[error("Invalid deadline")]
    InvalidDeadline {},

    #[error("Invalid funds")]
    InvalidFunds {},

    #[error("Invalid denom: expected {expected}, found {found}")]
    InvalidDenom { expected: String, found: String },

    #[error("Campaign deadline has passed")]
    DeadlinePassed {},

    #[error("Campaign deadline not reached")]
    DeadlineNotReached {},

    #[error("Goal not reached")]
    GoalNotReached {},

    #[error("Campaign already claimed")]
    AlreadyClaimed {},

    #[error("Refund not available")]
    RefundNotAvailable {},

    #[error("No contribution found")]
    NoContribution {},
}

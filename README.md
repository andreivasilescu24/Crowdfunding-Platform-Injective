# Crowdfunding DApp — Injective

A permissionless crowdfunding platform built on Injective. Users create campaigns with an INJ target and a deadline. Donors contribute INJ tokens directly to the contract. If the goal is reached after the deadline, the creator claims the funds; otherwise, donors get a full refund.

---

## 1. Smart Contract

### Data

**Campaign**
| Field | Type | Description |
|---|---|---|
| `id` | `u64` | Unique campaign identifier |
| `creator` | `Addr` | Wallet address of the campaign creator |
| `goal` | `Uint128` | Target amount in INJ |
| `deadline` | `u64` | Unix timestamp after which the campaign is resolved |
| `raised` | `Uint128` | Accumulated donations so far |
| `withdrawn` | `bool` | Whether the creator has already claimed the funds |

**Contributions:** `(campaign_id, donor_address) → amount` — tracks each donor's contribution per campaign, used to calculate refunds.

### Execute Messages

| Message | Who | Condition | Effect |
|---|---|---|---|
| `Create { goal, duration_sec }` | Anyone | — | Opens a new campaign |
| `Donate { campaign_id }` | Anyone | Deadline not passed | Adds sent INJ to the campaign |
| `Claim { campaign_id }` | Creator | Deadline passed + goal reached + not withdrawn | Transfers raised funds to creator |
| `Refund { campaign_id }` | Donor | Deadline passed + goal **not** reached | Returns the caller's contribution |

### Query Messages

| Query | Returns |
|---|---|
| `GetCampaign { campaign_id }` | Campaign details |
| `GetContribution { campaign_id, contributor }` | Amount donated by a specific address |
| `GetAllCampaigns {}` | List of all campaigns |

---

## 2. Frontend (React / Next.js)

### Wallet

- Connect / disconnect via **Keplr** (Injective Mainnet, `injective-1`)
- Connected address shown in the header; all actions require a signed transaction

### Dashboard

- Stats bar: total campaigns, active campaigns, total INJ raised
- Filter tabs: All / Active / Ended / Mine
- **Create campaign** form — title, description, goal in INJ, duration selector

### Campaign Card

Each card shows the campaign title, description, creator address, deadline countdown, and a progress bar (raised / goal).

Contextual actions — shown only when conditions are met:

| Button | Visible to | Condition |
|---|---|---|
| **Donate** | Any connected wallet | Campaign is still active |
| **Claim** | Creator only | Deadline passed + goal reached + not yet withdrawn |
| **Refund** | Donors only | Deadline passed + goal **not** reached + has a contribution |

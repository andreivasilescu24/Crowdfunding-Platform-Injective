export type Campaign = {
  id: number;
  creator: string;
  title: string;
  description: string;
  goalInj: string;       // INJ as decimal string
  raisedInj: string;     // INJ as decimal string
  deadline: number;      // unix seconds
  withdrawn: boolean;
};

export type Contribution = {
  campaignId: number;
  donor: string;
  amountInj: string;     // INJ as decimal string
};
